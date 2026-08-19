// WinEventHook.hpp - Captures window create / show / foreground / destroy
// for ALL top-level visible windows (no PID filtering).
//
// Correlation by process tree is unreliable for UWP/MSIX/reuse scenarios, so
// we deliberately capture every qualifying window event and let the Timeline
// decide which one is the target (by process-name matching against the
// ProcessRegistry). Filtering here is purely structural:
//   - idObject == OBJID_WINDOW
//   - WS_VISIBLE at SHOW time (CREATE may precede visibility, so we keep CREATE
//     of top-level windows and let Timeline reconcile)
//   - top-level (GetAncestor(GA_ROOT) == hwnd)
//   - not a known noise class (tooltips, IME, message-only, shell helpers)
//
// SetWinEventHook with WINEVENT_OUTOFCONTEXT delivers on a dedicated thread
// that MUST pump messages. dwmsEventTime (GetTickCount) is unused; we stamp QPC.
#pragma once
#include <windows.h>
#include <atomic>
#include <cstdio>
#include <thread>
#include "EventQueue.hpp"
#include "Config.hpp"
#include "QpcClock.hpp"

namespace st {

class WinEventHook {
public:
    // Diagnostics.
    std::atomic<size_t> total_events{0};
    std::atomic<size_t> captured{0};
    std::atomic<bool>   debug{false};

    // Start the hook thread. Returns only once the thread has installed its
    // hooks and set g_self, so callers can push to the queue immediately
    // without racing the hook setup. Only ONE WinEventHook may exist at a time
    // (g_self is a process-wide static the out-of-context callback uses to
    // find its owner; out-of-context callbacks always run on our single hook
    // thread, so a single slot is sufficient).
    bool start(EventQueue* q) {
        q_ = q;
        stop_ = false;
        ready_.store(false, std::memory_order_release);
        thread_ = std::thread([this] { run(); });
        // Wait until run() has set g_self and installed the hooks, so we don't
        // miss early window events from the about-to-be-launched target.
        for (int i = 0; i < 500; ++i) {  // up to ~5s
            if (ready_.load(std::memory_order_acquire)) break;
            Sleep(10);
        }
        return true;
    }

    void stop() {
        stop_ = true;
        if (thread_id_ != 0) PostThreadMessageW(thread_id_, WM_QUIT, 0, 0);
        if (thread_.joinable()) thread_.join();
    }

    ~WinEventHook() { stop(); }

private:
    // True if the window class is a known non-app window we skip for timing.
    static bool is_skip_class(HWND hwnd) {
        wchar_t cls[64] = {};
        if (GetClassNameW(hwnd, cls, 64) == 0) return false;
        static const wchar_t* kSkip[] = {
            L"Tooltips_class32", L"MSCTFIME UI", L"IME",
            L"Default IME", L"ComboBox", L"Static",
            L"Button", L"Edit",
            // Chromium / shell helper / message-only windows during startup.
            L"Chrome_WidgetWin_0", L"Chrome_MessageWindow",
            L"Intermediate D3D Window",
            L"OleMainThreadWndClass", L"Base_PowerMessageWindow",
            L"crashpad_SessionEndWatcher",
            L"_WwB", L"_WwG",
            L"GlyphFast", L"EllipseProgress",
            // System shell / DWM / input hosts.
            L"ApplicationFrameCompositing",
            L"Shell_TrayWnd", L"Shell_SecondaryTrayWnd",
        };
        for (auto s : kSkip) {
            int i = 0;
            while (s[i]) { if (s[i] != cls[i]) break; ++i; }
            if (s[i] == 0 && cls[i] == 0) return true;
        }
        return false;
    }

    static bool is_top_level(HWND hwnd) {
        return GetAncestor(hwnd, GA_ROOT) == hwnd;
    }

    static VOID CALLBACK callback(HWINEVENTHOOK, DWORD event, HWND hwnd,
                                  LONG idObject, LONG,
                                  DWORD, DWORD) {
        auto self = g_self;
        if (!self) return;
        self->total_events.fetch_add(1, std::memory_order_relaxed);
        if (idObject != OBJID_WINDOW || !hwnd) return;

        // Stamp QPC first so the timestamp reflects delivery time.
        long long qpc = QpcClock::now();

        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);

        bool top  = is_top_level(hwnd);
        bool skip = is_skip_class(hwnd);

        // DESTROY is always forwarded (even for non-top-level) so the Timeline
        // can mark a window dead regardless of class - a splash that we earlier
        // skipped by class still needs its death recorded if it was tracked.
        if (event == EVENT_OBJECT_DESTROY) {
            Event e;
            e.kind = Event::kWindowDestroy;
            e.pid  = pid;
            e.qpc  = qpc;
            e.aux  = reinterpret_cast<long long>(hwnd);
            self->q_->push(e);
            return;
        }

        if (self->debug.load(std::memory_order_relaxed) &&
            self->captured.load(std::memory_order_relaxed) < 8) {
            wchar_t cls[64] = {};
            GetClassNameW(hwnd, cls, 64);
            std::fprintf(stderr,
                "[winev] event=%lu pid=%lu top=%d skip=%d cls=\"%ls\"\n",
                event, pid, top ? 1 : 0, skip ? 1 : 0, cls);
        }

        // Structural filter: keep top-level, non-noise windows. PID correlation
        // and splash-vs-main disambiguation are the Timeline's job (it uses
        // window lifetime tracking: splash windows are destroyed early, the
        // real main window persists).
        if (!top) return;
        if (skip) return;

        Event e;
        e.pid = pid;
        e.qpc = qpc;
        e.aux = reinterpret_cast<long long>(hwnd);

        switch (event) {
            case EVENT_OBJECT_CREATE:
                e.kind = Event::kWindowCreate;
                self->q_->push(e);
                self->captured.fetch_add(1, std::memory_order_relaxed);
                break;
            case EVENT_OBJECT_SHOW:
                e.kind = Event::kWindowShow;
                self->q_->push(e);
                self->captured.fetch_add(1, std::memory_order_relaxed);
                break;
            case EVENT_SYSTEM_FOREGROUND:
                e.kind = Event::kWindowForeground;
                self->q_->push(e);
                self->captured.fetch_add(1, std::memory_order_relaxed);
                break;
            default:
                break;
        }
    }

    void run() {
        thread_id_ = GetCurrentThreadId();
        g_self = this;

        HWINEVENTHOOK h1 = SetWinEventHook(
            EVENT_OBJECT_CREATE, EVENT_OBJECT_CREATE,
            nullptr, &WinEventHook::callback,
            0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        HWINEVENTHOOK h2 = SetWinEventHook(
            EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW,
            nullptr, &WinEventHook::callback,
            0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        HWINEVENTHOOK h3 = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
            nullptr, &WinEventHook::callback,
            0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
        HWINEVENTHOOK h4 = SetWinEventHook(
            EVENT_OBJECT_DESTROY, EVENT_OBJECT_DESTROY,
            nullptr, &WinEventHook::callback,
            0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);

        // Hooks are installed and g_self is set - signal start() that it can
        // proceed to launch the target without missing early events.
        ready_.store(true, std::memory_order_release);

        MSG msg;
        while (!stop_) {
            BOOL r = GetMessageW(&msg, nullptr, 0, 0);
            if (r <= 0) break;
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        if (h1) UnhookWinEvent(h1);
        if (h2) UnhookWinEvent(h2);
        if (h3) UnhookWinEvent(h3);
        if (h4) UnhookWinEvent(h4);
        g_self = nullptr;
    }

    EventQueue*       q_ = nullptr;
    std::thread       thread_;
    DWORD             thread_id_ = 0;
    std::atomic<bool> stop_{false};
    std::atomic<bool> ready_{false};  // set once hooks are installed

    // Out-of-context callbacks are delivered on our single hook thread, so one
    // static slot is sufficient.
    static WinEventHook* g_self;
};

inline WinEventHook* WinEventHook::g_self = nullptr;

} // namespace st
