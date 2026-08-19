// DxgKrnlSession.hpp - Detects the first "frame committed to DWM" event.
//
// Provider: Microsoft-Windows-DxgKrnl {802ec45a-1e99-4b83-9920-87c98277ba9d}
// The "first present" signal is PresentHistory Stop:
//   EventID 173, Version 2, Opcode 2  (DXGKETW_PRESENTHISTORYEVENT _STOP)
// Fallback: PresentHistory Start (EventID 171, Version 2, Opcode 1) - emitted
// when the app initiates a present, slightly earlier than the confirmed commit.
//
// For DxgKrnl events, EventHeader.ProcessId IS the caller pid (dxgkrnl emits in
// the calling process's context). Multi-process apps (Edge/Chrome/Electron/WPF)
// present from a child GPU process whose Process/Start event may not have been
// consumed yet when its first present fires.
//
// This session therefore performs NO pid filtering and keeps no "already
// emitted" state: EVERY PresentHistory event is forwarded as-is on a dedicated
// queue, and the Timeline owns correlation (accept tracked pids immediately;
// cache the rest and re-check after the tree grows). Filtering here would
// permanently drop the app's first present on the cold-start race - DWM and
// unrelated apps present continuously, so a single upstream decision made on
// the wrong event can never be revisited.
#pragma once
#include "EtwSession.hpp"
#include "EventQueue.hpp"
#include <atomic>
#include <cstdio>

namespace st {

class DxgKrnlSession : public EtwSession {
public:
    // Microsoft-Windows-DxgKrnl provider GUID.
    static const GUID kProviderGuid;

    // Diagnostics exposed for --debug.
    std::atomic<size_t> total_events{0};     // every record on the callback
    std::atomic<size_t> present_events{0};   // records from the provider
    std::atomic<size_t> pushed_presents{0};  // records matching a Present id
    std::atomic<bool>   debug{false};

    bool start(EventQueue* present_q) {
        q_ = present_q;

        // Use a unique session name (collector pid + tick) so a crashed
        // previous run can never collide with us by name. A killed run also
        // leaves ORPHANED sessions under this prefix holding the DxgKrnl
        // provider; while one lingers, new sessions may receive no events at
        // all - so evict every stale AppTrace-DxgKrnl* session first, plus
        // the legacy StartupTime-DxgKrnl* prefix from builds before the
        // project rename.
        stop_stale_sessions(L"AppTrace-DxgKrnl");
        stop_stale_sessions(L"StartupTime-DxgKrnl");

        wchar_t name[64];
        wsprintfW(name, L"AppTrace-DxgKrnl-%lu-%u",
                  GetCurrentProcessId(), static_cast<unsigned>(GetTickCount()));

        for (int attempt = 0; attempt < 3; ++attempt) {
            if (!start_regular(name, &DxgKrnlSession::on_record, this)) {
                if (last_error_ == ERROR_ALREADY_EXISTS) {
                    Sleep(50);
                    continue;
                }
                return false;
            }
            if (!enable_provider(kProviderGuid, TRACE_LEVEL_INFORMATION, 0, 0)) {
                // ERROR_NO_SYSTEM_RESOURCES (1450) is a known transient quirk
                // for graphics providers under elevation; back off and retry.
                stop();
                Sleep(150 * (attempt + 1));
                continue;
            }
            return true;
        }
        return false;
    }

private:
    static void WINAPI on_record(PEVENT_RECORD rec, void* ctx) {
        auto self = static_cast<DxgKrnlSession*>(ctx);
        self->handle(rec);
    }

    void handle(PEVENT_RECORD rec) {
        total_events.fetch_add(1, std::memory_order_relaxed);

        // Provider filter: only Microsoft-Windows-DxgKrnl.
        if (!IsEqualGUID(rec->EventHeader.ProviderId, kProviderGuid)) return;

        present_events.fetch_add(1, std::memory_order_relaxed);

        const auto& ed = rec->EventHeader.EventDescriptor;
        const USHORT id       = ed.Id;
        const UCHAR  version  = ed.Version;
        const UCHAR  opcode   = ed.Opcode;

        // Primary: PresentHistory Stop (frame committed to DWM).
        // Fallback: PresentHistory Start (app initiated present).
        bool is_present_stop  = (id == 173 && version == 2 && opcode == 2);
        bool is_present_start = (id == 171 && version == 2 && opcode == 1);
        // Older builds emit id 184 (Present) - accept as a last resort.
        // (Field data, Win11 26200: id 184 is in fact the DOMINANT signal for
        // many apps - Photoshop/Illustrator/Electron all fire it - while 173
        // arrives via dwm.exe for composition-model apps and rarely carries
        // the app pid.)
        bool is_present_info  = (id == 184 && version >= 1 && opcode == 0);
        if (!(is_present_stop || is_present_start || is_present_info)) return;

        // For DxgKrnl events, EventHeader.ProcessId is the caller (the GPU
        // child process for multi-process apps; dwm.exe in RDP sessions).
        unsigned int pid = rec->EventHeader.ProcessId;

        // In --debug mode, dump the first few PUSHED PresentHistory PIDs so we
        // can see which processes are actually presenting (useful for multi-
        // process apps or diagnosing RDP where DWM presents on the app's
        // behalf). Gates on pushed_presents, not present_events: the session
        // carries a flood of non-present provider events (scheduler etc.) that
        // saturates any raw counter within microseconds.
        size_t n = pushed_presents.fetch_add(1, std::memory_order_relaxed) + 1;
        if (debug.load(std::memory_order_relaxed) && n <= 8) {
            std::fprintf(stderr, "[dxg] event_id=%u pid=%lu\n",
                         id, rec->EventHeader.ProcessId);
        }

        // Forward every present unfiltered - correlation happens downstream
        // (Timeline::on_present caches, revisit_presents re-checks). See the
        // file header for why filtering here is incorrect.
        Event e;
        e.kind = Event::kFirstPresent;
        e.pid  = rec->EventHeader.ProcessId;
        e.qpc  = rec->EventHeader.TimeStamp.QuadPart;
        e.aux  = static_cast<long long>(id); // record which event id fired
        q_->push(e);
    }

    EventQueue* q_ = nullptr;
};

// {802ec45a-1e99-4b83-9920-87c98277ba9d}  (note trailing 9d, not 9c)
inline const GUID DxgKrnlSession::kProviderGuid = {
    0x802ec45a, 0x1e99, 0x4b83,
    { 0x99, 0x20, 0x87, 0xc9, 0x82, 0x77, 0xba, 0x9d }};

} // namespace st
