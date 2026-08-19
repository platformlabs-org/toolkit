// EtwSession.hpp - RAII wrapper over StartTrace / ProcessTrace / ControlTrace.
//
// Two flavors are needed:
//   1) The system NT Kernel Logger  (reserved session name + SystemTraceControlGuid)
//   2) A regular session that enables a manifest provider via EnableTraceEx2
// Both share the same buffer/clock/real-time configuration; only startup differs.
//
// Each session owns a dedicated consumer thread running ProcessTrace. The
// EventRecordCallback runs on that thread - it must stay cheap. Subclasses
// (KernelSession / DxgKrnlSession) install a callback that filters by PID and
// pushes onto a lock-free queue.
//
// Lifetime: start() spawns the consumer thread; stop() flushes via
// ControlTrace(STOP) then joins. stop() uses the session handle only (not the
// name string), so it is safe to call from the destructor even after subclass
// members have been destroyed.
#pragma once
#include <windows.h>
#include <evntrace.h>
#include <evntcons.h>
#include <string>
#include <vector>
#include <cwchar>
#include <thread>
#include <atomic>
#include <initguid.h>
#include "Config.hpp"

namespace st {

// Backing storage for EVENT_TRACE_PROPERTIES. The struct is variable-length:
// the string buffers (logger name + log file name) are appended inline.
struct TraceProps {
    EVENT_TRACE_PROPERTIES props;
    wchar_t logger_name[MAX_PATH];
    wchar_t log_file_name[MAX_PATH];
};

// Build a zeroed TraceProps sized for ControlTrace(STOP/QUERY) calls that only
// need the logger-name slot. Centralized here to avoid 5 copies of the same
// boilerplate across the session lifecycle.
inline TraceProps make_control_props() {
    TraceProps p;
    ZeroMemory(&p, sizeof(p));
    p.props.Wnode.BufferSize  = sizeof(p);
    p.props.LoggerNameOffset  = offsetof(TraceProps, logger_name);
    p.props.LogFileNameOffset = 0;
    return p;
}

// Callback signature subclasses implement.
using RecordCallback = void (*)(PEVENT_RECORD rec, void* ctx);

class EtwSession {
public:
    EtwSession() = default;
    virtual ~EtwSession() { stop(); }

    EtwSession(const EtwSession&) = delete;
    EtwSession& operator=(const EtwSession&) = delete;

    // Returns the last Win32 error from StartTrace / EnableTraceEx2 for
    // friendly diagnostics (e.g. ERROR_NO_SYSTEM_RESOURCES on DxgKrnl).
    DWORD last_error() const { return last_error_; }
    bool   running()   const { return running_.load(std::memory_order_acquire); }
    ULONG  events_lost() const { return events_lost_; }

    // Force-stop a stuck kernel logger session by name. Used to recover from
    // ERROR_ALREADY_EXISTS (183) left behind by a previous crashed run.
    // Returns true if a session was found and stopped (or none existed).
    static bool force_stop_kernel_logger() {
        auto p = make_control_props();
        ULONG err = ControlTraceW(
            0, KERNEL_LOGGER_NAME, &p.props, EVENT_TRACE_CONTROL_STOP);
        return err == ERROR_SUCCESS || err == ERROR_WMI_INSTANCE_NOT_FOUND;
    }

    // Evict every session whose name starts with `prefix`. An AppTrace
    // process killed mid-capture (task manager, test-harness force-kill) leaves
    // its uniquely-named real-time session behind with no consumer. While such
    // an orphan lingers with the DxgKrnl provider enabled, freshly created
    // sessions can receive zero events. Called at startup before creating our
    // own session. Returns how many stale sessions were stopped.
    static size_t stop_stale_sessions(const wchar_t* prefix) {
        ULONG needed = 0;
        QueryAllTracesW(nullptr, 0, &needed);
        if (needed == 0) return 0;

        std::vector<TraceProps> props(needed);
        std::vector<EVENT_TRACE_PROPERTIES*> ptrs(needed);
        for (ULONG i = 0; i < needed; ++i) {
            ZeroMemory(&props[i], sizeof(TraceProps));
            props[i].props.Wnode.BufferSize = sizeof(TraceProps);
            props[i].props.LoggerNameOffset = offsetof(TraceProps, logger_name);
            ptrs[i] = &props[i].props;
        }
        ULONG count = 0;
        if (QueryAllTracesW(ptrs.data(), needed, &count) != ERROR_SUCCESS || count == 0)
            return 0;

        size_t stopped = 0;
        size_t plen = std::wcslen(prefix);
        for (ULONG i = 0; i < count; ++i) {
            const wchar_t* name = props[i].logger_name;
            if (!name || std::wcsncmp(name, prefix, plen) != 0) continue;
            if (ControlTraceW(0, name, &props[i].props,
                              EVENT_TRACE_CONTROL_STOP) == ERROR_SUCCESS) {
                ++stopped;
            }
        }
        return stopped;
    }

protected:
    DWORD last_error_ = ERROR_SUCCESS;  // exposed so subclasses can retry on it

    // Start a *regular* session (not the kernel logger). The subclass then
    // calls enable_provider() to attach a manifest provider.
    bool start_regular(const wchar_t* session_name,
                       RecordCallback cb, void* ctx) {
        cb_ = cb;
        ctx_ = ctx;

        ZeroMemory(&props_, sizeof(props_));
        props_.props.Wnode.BufferSize    = sizeof(props_);
        props_.props.Wnode.Flags         = WNODE_FLAG_TRACED_GUID;
        props_.props.Wnode.ClientContext = 1; // QPC timebase
        props_.props.Wnode.Guid          = GUID{}; // assigned by StartTrace
        props_.props.BufferSize          = config::kEtwBufferSizeKb;  // KB
        props_.props.MinimumBuffers      = config::kEtwMinBuffers;
        props_.props.MaximumBuffers      = config::kEtwMaxBuffers;
        props_.props.FlushTimer          = 0;         // default 1s
        props_.props.LogFileMode         = EVENT_TRACE_REAL_TIME_MODE;
        props_.props.LoggerNameOffset    = offsetof(TraceProps, logger_name);
        props_.props.LogFileNameOffset   = 0;         // no file

        DWORD err = StartTraceW(&handle_, session_name, &props_.props);
        if (err != ERROR_SUCCESS) { last_error_ = err; return false; }

        session_name_ = session_name;
        return open_and_consume();
    }

    // Enable a manifest provider on an already-started regular session.
    // Retries a few times to work around the 1450 (ERROR_NO_SYSTEM_RESOURCES)
    // quirk seen on graphics providers under elevation.
    bool enable_provider(GUID provider_guid, UCHAR level = TRACE_LEVEL_INFORMATION,
                         ULONGLONG any_keyword = 0, ULONGLONG all_keyword = 0) {
        for (int attempt = 0; attempt < 5; ++attempt) {
            DWORD err = EnableTraceEx2(handle_, &provider_guid,
                                       EVENT_CONTROL_CODE_ENABLE_PROVIDER,
                                       level, any_keyword, all_keyword, 0, nullptr);
            if (err == ERROR_SUCCESS) return true;
            last_error_ = err;
            if (err != ERROR_NO_SYSTEM_RESOURCES) return false;
            Sleep(100 * (attempt + 1));
        }
        return false;
    }

    // Start the system NT Kernel Logger. enable_flags are EVENT_TRACE_FLAG_*.
    bool start_kernel_logger(ULONG enable_flags,
                             RecordCallback cb, void* ctx) {
        cb_ = cb;
        ctx_ = ctx;

        // SystemTraceControlGuid {9e814aad-3204-11d2-9a82-006008a86afe}
        static const GUID kSystemTraceControlGuid = {
            0x9e814aad, 0x3204, 0x11d2,
            { 0x9a, 0x82, 0x00, 0x60, 0x08, 0xa8, 0x6a, 0xfe }};

        ZeroMemory(&props_, sizeof(props_));
        props_.props.Wnode.BufferSize    = sizeof(props_);
        props_.props.Wnode.Flags         = WNODE_FLAG_TRACED_GUID;
        props_.props.Wnode.ClientContext = 1; // QPC timebase
        props_.props.Wnode.Guid          = kSystemTraceControlGuid;
        props_.props.BufferSize          = config::kEtwBufferSizeKb;  // KB
        props_.props.MinimumBuffers      = config::kEtwMinBuffers;
        props_.props.MaximumBuffers      = config::kEtwMaxBuffers;
        props_.props.FlushTimer          = 0;
        props_.props.LogFileMode         = EVENT_TRACE_SYSTEM_LOGGER_MODE |
                                          EVENT_TRACE_REAL_TIME_MODE;
        props_.props.EnableFlags         = enable_flags;
        props_.props.LoggerNameOffset    = offsetof(TraceProps, logger_name);
        props_.props.LogFileNameOffset   = 0;

        const wchar_t* kName = KERNEL_LOGGER_NAME;
        DWORD err = StartTraceW(&handle_, kName, &props_.props);
        if (err != ERROR_SUCCESS) {
            last_error_ = err;
            return false;
        }
        session_name_ = kName;
        return open_and_consume();
    }

    // Tear down: flush the session (ControlTrace STOP) so the consumer thread's
    // ProcessTrace returns, then join. Uses the session HANDLE only (not
    // session_name_), so it's safe from the destructor after subclass teardown.
    void stop() {
        if (!running_.exchange(false)) return;

        if (handle_ != 0) {
            auto p = make_control_props();
            ControlTraceW(handle_, nullptr, &p.props, EVENT_TRACE_CONTROL_STOP);
            handle_ = 0;
        }
        if (consumer_.joinable()) consumer_.join();
    }

private:
    bool open_and_consume() {
        ZeroMemory(&logfile_, sizeof(logfile_));
        logfile_.LoggerName         = const_cast<LPWSTR>(session_name_.c_str());
        logfile_.ProcessTraceMode   = PROCESS_TRACE_MODE_REAL_TIME |
                                      PROCESS_TRACE_MODE_EVENT_RECORD |
                                      PROCESS_TRACE_MODE_RAW_TIMESTAMP;
        logfile_.EventRecordCallback = &EtwSession::dispatch;
        logfile_.Context             = this;

        trace_handle_ = OpenTraceW(&logfile_);
        if (trace_handle_ == INVALID_PROCESSTRACE_HANDLE) {
            last_error_ = GetLastError();
            // Stop the session we just started.
            auto p = make_control_props();
            ControlTraceW(handle_, nullptr, &p.props, EVENT_TRACE_CONTROL_STOP);
            handle_ = 0;
            return false;
        }

        running_.store(true);
        consumer_ = std::thread([this] {
            ProcessTrace(&trace_handle_, 1, nullptr, nullptr);
            // ProcessTrace has returned - capture final EventsLost via QUERY.
            if (handle_ != 0) {
                auto p = make_control_props();
                if (ControlTraceW(handle_, nullptr, &p.props,
                                  EVENT_TRACE_CONTROL_QUERY) == ERROR_SUCCESS) {
                    events_lost_ = p.props.EventsLost;
                }
            }
        });
        return true;
    }

    static void WINAPI dispatch(PEVENT_RECORD rec) {
        auto self = static_cast<EtwSession*>(rec->UserContext);
        if (self && self->cb_) self->cb_(rec, self->ctx_);
    }

    TraceProps                 props_{};
    EVENT_TRACE_LOGFILE        logfile_{};
    TRACEHANDLE                handle_        = 0;
    TRACEHANDLE                trace_handle_  = 0;
    std::wstring               session_name_;   // only used at start/open time
    std::thread                consumer_;
    std::atomic<bool>          running_{false};
    ULONG                      events_lost_   = 0;

    RecordCallback             cb_  = nullptr;
    void*                      ctx_ = nullptr;
};

} // namespace st
