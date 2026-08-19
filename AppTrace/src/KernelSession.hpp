// KernelSession.hpp - NT Kernel Logger capturing ALL Process/Start events.
//
// No PID-tree gating: we record every process start into the ProcessRegistry
// so the Timeline can correlate windows back to process names regardless of
// how the target was launched (native exe, UWP alias, instance reuse, shell).
//
// Process/Start UserData layout (Process_TypeGroup1, x64 v3):
//   offset 0:  UniqueProcessKey  (8B pointer)
//   offset 8:  ProcessId         (4B)  <-- new pid
//   offset 12: ParentId          (4B)  <-- parent pid
// We only need these three fields. The image name is NOT read from UserData
// (its offset is variable due to the preceding UserSID); instead we call
// QueryFullProcessImageName in the callback - one syscall per process start,
// negligible cost.
#pragma once
#include "EtwSession.hpp"
#include "EventQueue.hpp"
#include "ProcessRegistry.hpp"
#include "Config.hpp"
#include <atomic>
#include <cstring>
#include <cctype>

namespace st {

class KernelSession : public EtwSession {
public:
    std::atomic<size_t> total_events{0};
    std::atomic<size_t> process_events{0};
    std::atomic<size_t> process_start_recorded{0};

    bool start(EventQueue* q, ProcessRegistry* reg) {
        q_ = q;
        reg_ = reg;
        ULONG flags = EVENT_TRACE_FLAG_PROCESS;
        if (start_kernel_logger(flags, &KernelSession::on_record, this))
            return true;
        if (last_error_ == ERROR_ALREADY_EXISTS) {
            EtwSession::force_stop_kernel_logger();
            Sleep(50);
            if (start_kernel_logger(flags, &KernelSession::on_record, this))
                return true;
        }
        return false;
    }

private:
    static void WINAPI on_record(PEVENT_RECORD rec, void* ctx) {
        auto self = static_cast<KernelSession*>(ctx);
        self->handle(rec);
    }

    // Look up the image name for a pid via the OS (avoids parsing the variable-
    // length UserSID in UserData). Lowercased basename only.
    static void query_image_name(unsigned int pid, char out[config::kRegistryNameLen]) {
        out[0] = 0;
        HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if (!h) return;
        wchar_t path[MAX_PATH] = {};
        DWORD len = MAX_PATH;
        if (QueryFullProcessImageNameW(h, 0, path, &len)) {
            // Take basename after the last separator.
            const wchar_t* base = path;
            for (const wchar_t* p = path; *p; ++p)
                if (*p == L'\\' || *p == L'/') base = p + 1;
            // Lowercase ASCII into out[].
            size_t i = 0;
            for (; base[i] && i < config::kRegistryNameLen - 1; ++i) {
                wchar_t c = base[i];
                out[i] = (c >= L'A' && c <= L'Z') ? (char)(c + 32) : (char)c;
            }
            out[i] = 0;
        }
        CloseHandle(h);
    }

    void handle(PEVENT_RECORD rec) {
        total_events.fetch_add(1, std::memory_order_relaxed);
        const auto& ed = rec->EventHeader.EventDescriptor;

        // NT Kernel Logger tags Process events with the Process TypeGroup guid
        // {3d6fa8d0-fe05-11d0-9dda-00c04fd7ba7c}; accept either that or a
        // plausible opcode-1 record (cross-version safety).
        static const GUID kProcessGuid = {
            0x3d6fa8d0, 0xfe05, 0x11d0,
            { 0x9d, 0xda, 0x00, 0xc0, 0x4f, 0xd7, 0xba, 0x7c }};

        bool is_process_provider = IsEqualGUID(rec->EventHeader.ProviderId, kProcessGuid);
        if (!is_process_provider) {
            if (ed.Opcode != 1) return;
            if (rec->UserDataLength < 16) return;
        }
        if (ed.Opcode != 1) return;  // Process/Start only

        process_events.fetch_add(1, std::memory_order_relaxed);

        auto data = static_cast<const unsigned char*>(rec->UserData);
        USHORT len = rec->UserDataLength;
        uint32_t pid = 0, parent = 0;
        if (ed.Version >= 3) {
            if (len < 16) return;
            memcpy(&pid,    data + 8,  4);
            memcpy(&parent, data + 12, 4);
        } else {
            if (len < 12) return;
            memcpy(&pid,    data + 4, 4);
            memcpy(&parent, data + 8, 4);
        }

        // Record into the global registry with the image name. This is the
        // correlation backbone for window matching.
        char name[config::kRegistryNameLen] = {};
        query_image_name(pid, name);
        reg_->record(pid, parent, rec->EventHeader.TimeStamp.QuadPart, name);
        process_start_recorded.fetch_add(1, std::memory_order_relaxed);

        // Push to the event queue so the Timeline can grow the process tree
        // (parent chain + orphan adoption) and derive T1 from the tree root.
        // We copy the (already lowercased) name into the 32-byte Event field.
        Event e;
        e.kind       = Event::kProcessStart;
        e.pid        = pid;
        e.parent_pid = parent;
        e.qpc        = rec->EventHeader.TimeStamp.QuadPart;
        std::strncpy(e.name, name, sizeof(e.name) - 1);
        e.name[sizeof(e.name) - 1] = 0;
        q_->push(e);
    }

    EventQueue*       q_   = nullptr;
    ProcessRegistry*  reg_ = nullptr;
};

} // namespace st
