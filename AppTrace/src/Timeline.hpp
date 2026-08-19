// Timeline.hpp - Real-time process-tree correlation with window-lifetime tracking.
//
// The PidTracker is grown incrementally from ETW Process/Start events as they
// arrive (parent chain + orphan adoption). Once a pid is in the tree, its
// Window and Present events are accepted.
//
// Events that arrive BEFORE their owning pid enters the tree are NOT dropped:
// both Present and Window events are cached in bounded rings and re-checked on
// every tree growth (revisit_presents/revisit_windows). This covers two real
// orderings: a GPU child presenting before its Process/Start is consumed, and
// a reused instance (Edge startup boost) showing its window before adoption
// completes.
//
// Orphan adoption has two rules, evaluated per Process/Start event:
//   - name match: image basename == target name and start >= T0
//   - install-root match: image directory is under the target's install
//     directory and start >= T0. Covers launcher stubs whose real app lives
//     in a versioned subdirectory under a different name (Soda Music et al).
//     Disabled for system/shared roots (C:\Windows, Program Files) where it
//     would over-adopt unrelated OS processes.
//
// T2/T3 are NOT decided on the first window event. Instead we track every
// top-level window's lifetime (CREATE -> SHOW/FOREGROUND -> DESTROY) in a
// list, and defer the decision to finalize_windows(), called after the capture
// grace window (see finalize_windows for the full rule ladder). The gist:
// splash windows are excluded by their DESTROY; error-dialog-titled popups are
// excluded outright; among the rest, the largest window wins (the main window
// is the biggest thing on screen), falling back to earliest FOREGROUND, then
// latest CREATE.
//
// Anchors (all QPC):
//   t0  launch moment
//   t1  earliest Process/Start of the target-name process in the tree
//   t2  CREATE of the selected main window (decided at finalize)
//   t3  SHOW/FOREGROUND of the selected main window (falls back to t2)
//   t4  first PresentHistory from a tracked pid (presents arrive on a
//       dedicated queue, unfiltered; those from not-yet-tracked pids are
//       cached and re-checked as the tree grows - see revisit_presents)
#pragma once
#include "EventQueue.hpp"
#include "PidTracker.hpp"
#include "QpcClock.hpp"
#include <atomic>
#include <cstring>
#include <cstdio>
#include <string>
#include <cctype>
#include <vector>
#include <windows.h>

namespace st {

struct Anchors {
    long long t0 = 0;
    long long t1 = 0;
    long long t2 = 0;
    long long t3 = 0;   // window SHOW/FOREGROUND - "the user sees the frame"
    long long t4 = 0;
    unsigned int main_pid = 0;
    long long present_event_id = 0;
};

class Timeline {
public:
    Timeline(QpcClock& clock, PidTracker& tracker, const char* target_name)
        : clock_(clock), tracker_(tracker) {
        std::strncpy(target_, target_name ? target_name : "", sizeof(target_) - 1);
        target_[sizeof(target_) - 1] = 0;
        for (char* p = target_; *p; ++p) *p = (char)tolower((unsigned char)*p);
        tracker_.set_target(target_);
    }

    void set_t0(long long qpc) {
        anchors_.t0 = qpc;
        tracker_.set_t0(qpc);
    }

    // Record the target exe's install directory (lowercased by us), enabling
    // install-root orphan adoption. Disabled for system/shared roots where
    // "same directory" would adopt unrelated OS processes.
    void set_target_dir(const char* dir) {
        if (!dir || !dir[0]) return;
        std::strncpy(target_dir_, dir, sizeof(target_dir_) - 1);
        target_dir_[sizeof(target_dir_) - 1] = 0;
        for (char* p = target_dir_; *p; ++p) *p = (char)tolower((unsigned char)*p);
        // Strip a trailing separator so path_is_under() comparisons are
        // uniform ("c:\a\b" rather than "c:\a\b\").
        size_t len = std::strlen(target_dir_);
        while (len > 3 && (target_dir_[len - 1] == '\\' || target_dir_[len - 1] == '/'))
            target_dir_[--len] = 0;
        static const char* kBlockedRoots[] = {
            "c:\\", "c:\\windows",
            "c:\\program files", "c:\\program files (x86)",
        };
        dir_adoption_ok_ = true;
        for (auto b : kBlockedRoots) {
            if (path_is_under(target_dir_, b)) { dir_adoption_ok_ = false; break; }
        }
    }

    // True when `child` names the same directory as `root` or one inside it
    // (prefix on path-component boundaries). Both are plain lowercased
    // directory strings without trailing separators. Public static so the
    // boundary logic is unit-testable.
    static bool path_is_under(const char* child, const char* root) {
        if (!child || !root || !child[0] || !root[0]) return false;
        size_t n = std::strlen(root);
        if (std::strncmp(child, root, n) != 0) return false;
        char c = child[n];
        return c == 0 || c == '\\' || c == '/';
    }

    // Called by the orchestrator after an out-of-band adoption (reuse
    // instance found by name scan). Cached Present/Window events may now be
    // attributable, so re-run both revisits.
    void on_adoption() {
        revisit_presents();
        revisit_windows();
    }

    // Drain one event: general queue first (window/process events are scarce
    // and precious; presents are high-rate and tolerate delay), then the
    // dedicated present queue. Returns false when the capture should stop.
    bool drain_one(EventQueue& q, EventQueue& present_q,
                   long long grace_deadline_qpc, long long overall_deadline_qpc) {
        Event e;
        if (!q.pop(e) && !present_q.pop(e))
            return not_finished(grace_deadline_qpc, overall_deadline_qpc);

        switch (e.kind) {
            case Event::kProcessStart:     on_process_start(e); break;
            case Event::kWindowCreate:
            case Event::kWindowShow:
            case Event::kWindowForeground: on_window(e); break;
            case Event::kWindowDestroy:    on_window_destroy(e); break;
            case Event::kFirstPresent:     on_present(e); break;
            default: break;
        }
        return not_finished(grace_deadline_qpc, overall_deadline_qpc);
    }

    // True if a window's title marks it as a welcome/splash-style surface that
    // stays alive but isn't the app's main window (e.g. After Effects' welcome
    // dialog). Used as a tie-break when several windows survive the capture.
    // CJK markers are written as escaped code points so this file stays plain
    // ASCII (codepage-safe regardless of how the file is saved).
    static bool is_welcome_title(HWND hwnd) {
        wchar_t title[128] = {};
        if (GetWindowTextW(hwnd, title, 128) == 0) return false;
        static const wchar_t* kMarkers[] = {
            L"welcome", L"get started",
            // CJK: huan ying (welcome), kai shi shi yong (get started),
            // zheng zai jia zai (loading), xin gong neng (what's new).
            L"\x6b22\x8fce", L"\x5f00\x59cb\x4f7f\x7528",
            L"\x6b63\x5728\x52a0\x8f7d", L"\x65b0\x529f\x80fd",
        };
        // Lowercase the title once for case-insensitive matching.
        for (wchar_t* p = title; *p; ++p) {
            if (*p >= L'A' && *p <= L'Z') *p = (wchar_t)(*p + 32);
        }
        for (auto m : kMarkers) {
            if (wcsstr(title, m)) return true;
        }
        return false;
    }

    // True if a window's title marks it as an error/warning DIALOG (e.g.
    // Office's localized error box that appears when an unactivated install
    // meets a Protected-View file). Such a popup must never be selected as the
    // main window even though it is late-created and alive - the heuristic that
    // otherwise favors it. CJK markers as escaped code points (ASCII file).
    static bool is_error_title(HWND hwnd) {
        wchar_t title[128] = {};
        if (GetWindowTextW(hwnd, title, 128) == 0) return false;
        return title_matches_error(title);
    }

    // Pure-string predicate (unit-testable): the zh error/warning words and
    // en "error"/"warning"/"problem", case-insensitive substring.
    static bool title_matches_error(const wchar_t* title) {
        if (!title || !title[0]) return false;
        static const wchar_t* kMarkers[] = {
            L"\x51fa\x73b0\x4e86\x9519\x8bef",  // chu xian le cuo wu
            L"\x9519\x8bef",                    // cuo wu (error)
            L"\x8b66\x544a",                    // jing gao (warning)
            L"error", L"warning", L"problem",
        };
        wchar_t low[128] = {};
        for (int i = 0; title[i] && i < 127; ++i) {
            low[i] = (title[i] >= L'A' && title[i] <= L'Z')
                         ? (wchar_t)(title[i] + 32) : title[i];
        }
        for (auto m : kMarkers) {
            if (m[0] >= 0x80) {  // CJK: substring search
                if (wcsstr(low, m)) return true;
            } else {             // ASCII marker: already lowercase
                if (wcsstr(low, m)) return true;
            }
        }
        return false;
    }

    // Area of a live, non-minimized window in pixels (0 when unknown,
    // minimized, or bogus). Minimized windows report a (-32000,-32000) rect,
    // which IsIconic filters out before the math.
    static LONG window_area(HWND hwnd) {
        if (!IsWindow(hwnd) || IsIconic(hwnd)) return 0;
        RECT r{};
        if (!GetWindowRect(hwnd, &r)) return 0;
        LONG w = r.right - r.left, h = r.bottom - r.top;
        return (w > 0 && h > 0) ? w * h : 0;
    }

    // Called once after the drain loop ends (and before reading anchors).
    // Selects the real main window from the tracked window lifetimes and sets
    // the final T2/T3. Selection, strongest signal first:
    //   1. alive + non-error + non-welcome, LARGEST window area wins - the
    //      main window is the biggest thing on screen; helper windows, late
    //      untitled companions and pre-main dialogs (login boxes that steal
    //      the foreground) are all smaller.
    //   2. otherwise earliest FOREGROUND among alive candidates - the
    //      strongest event-based "the user saw THIS window" signal (used when
    //      areas are unavailable, e.g. everything minimized).
    //   3. otherwise the LATEST create among alive candidates
    //      (classic splash-then-mainwindow: splash is destroyed, main is last).
    //   4. otherwise any alive window; 5. otherwise the longest-lived dead one
    //      (app crashed / everything closed during capture).
    // T3 = earliest of the chosen window's SHOW / FOREGROUND, falling back to
    // its CREATE when neither fired (RDP and never-shown edge cases).
    void finalize_windows() {
        if (windows_.empty()) return;

        WinInfo* best_area = nullptr;        // largest area, alive, clean title
        LONG     best_area_v = 0;
        WinInfo* best_fg = nullptr;          // earliest FOREGROUND, alive, clean title
        WinInfo* best_alive = nullptr;      // latest CREATE, alive, clean title
        WinInfo* best_any_alive = nullptr;  // latest CREATE, alive, any title
        for (auto& w : windows_) {
            if (w.destroyed) continue;
            HWND hwnd = reinterpret_cast<HWND>(w.hwnd);
            // Error/warning dialogs are never the main window, no matter how
            // late they appear (Office's localized error popup on unactivated
            // installs opening Protected-View files).
            if (IsWindow(hwnd) && is_error_title(hwnd)) continue;
            if (!best_any_alive || w.create_qpc > best_any_alive->create_qpc) {
                best_any_alive = &w;
            }
            // Welcome-titled windows are demoted: only used if nothing else
            // survives. The window is still alive, so we can query its title.
            if (IsWindow(hwnd) && is_welcome_title(hwnd)) continue;
            LONG area = window_area(hwnd);
            if (area > best_area_v) {
                best_area_v = area;
                best_area = &w;
            }
            if (w.fg_qpc != 0 &&
                (!best_fg || w.fg_qpc < best_fg->fg_qpc)) {
                best_fg = &w;
            }
            if (!best_alive || w.create_qpc > best_alive->create_qpc) {
                best_alive = &w;
            }
        }
        WinInfo* chosen = best_area ? best_area
                      : (best_fg ? best_fg
                      : (best_alive ? best_alive : best_any_alive));

        if (chosen) {
            anchors_.t2 = chosen->create_qpc;
            // T3 = SHOW or FOREGROUND of the chosen window (earliest of the two);
            // falls back to create_qpc if neither was observed.
            long long t3 = chosen->show_qpc;
            if (t3 == 0 || (chosen->fg_qpc != 0 && chosen->fg_qpc < t3))
                t3 = chosen->fg_qpc;
            if (t3 == 0) t3 = chosen->create_qpc;  // no SHOW (e.g. RDP)
            anchors_.t3 = t3;
            return;
        }

        // Fallback: every window was destroyed during capture (e.g. app crashed
        // or all were splash). Pick the one that lived longest as the best
        // approximation of the "real" window.
        WinInfo* best_lived = nullptr;
        for (auto& w : windows_) {
            long long lifespan = w.destroyed ? (w.destroy_qpc - w.create_qpc) : 0;
            long long best_life = best_lived
                ? (best_lived->destroyed ? (best_lived->destroy_qpc - best_lived->create_qpc) : 0)
                : -1;
            if (lifespan > best_life) best_lived = &w;
        }
        if (best_lived) {
            anchors_.t2 = best_lived->create_qpc;
            long long t3 = best_lived->show_qpc ? best_lived->show_qpc
                                                : best_lived->create_qpc;
            anchors_.t3 = t3;
        }
    }

    bool first_present_seen() const { return first_present_seen_; }
    bool main_pid_found()    const { return main_pid_found_.load(std::memory_order_acquire); }
    const Anchors& anchors() const { return anchors_; }
    size_t window_count() const { return windows_.size(); }

    // --debug: dump every tracked window's timeline (ms relative to T0).
    // Shows which window finalize chose and how splash/launcher windows
    // behaved - the evidence needed to reason about "content ready" vs
    // "frame shown" for apps whose document loads asynchronously.
    void dump_windows() const {
        long long t2 = anchors_.t2, t3 = anchors_.t3;
        for (const auto& w : windows_) {
            // Current title (queried at finalize time; may be empty for dead
            // windows). Emits UTF-8 so CJK titles survive the log.
            wchar_t wtitle[80] = {};
            HWND hwnd = reinterpret_cast<HWND>(w.hwnd);
            if (IsWindow(hwnd)) GetWindowTextW(hwnd, wtitle, 80);
            char title[160] = {};
            WideCharToMultiByte(CP_UTF8, 0, wtitle, -1, title, sizeof(title),
                                nullptr, nullptr);
            std::fprintf(stderr,
                "[win] pid=%u create=%s show=%s fg=%s destroy=%s chosen=%d title=%s\n",
                w.pid,
                ms_str(anchors_.t0, w.create_qpc).c_str(),
                ms_str(anchors_.t0, w.show_qpc).c_str(),
                ms_str(anchors_.t0, w.fg_qpc).c_str(),
                w.destroyed ? ms_str(anchors_.t0, w.destroy_qpc).c_str() : std::string("-").c_str(),
                (w.create_qpc == t2 && (w.show_qpc == t3 || w.fg_qpc == t3)) ? 1 : 0,
                title);
        }
    }

    double ms(long long from, long long to) const {
        if (from == 0 || to == 0 || to < from) return 0.0;
        return clock_.to_ms_d(to - from);
    }

    // "123.4" or "-" when the anchor is unset - for dump_windows().
    std::string ms_str(long long from, long long to) const {
        if (to == 0) return "-";
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%.1f", ms(from, to));
        return buf;
    }

private:
    // Per-window lifetime record, keyed by hwnd (stored in Event::aux).
    struct WinInfo {
        long long   hwnd        = 0;
        unsigned int pid         = 0;
        long long   create_qpc  = 0;
        long long   show_qpc    = 0;
        long long   fg_qpc      = 0;
        long long   destroy_qpc = 0;
        bool        destroyed   = false;
    };

    WinInfo* find_or_create_window(long long hwnd) {
        for (auto& w : windows_) {
            if (w.hwnd == hwnd) return &w;
        }
        windows_.push_back(WinInfo{});
        windows_.back().hwnd = hwnd;
        return &windows_.back();
    }

    void on_process_start(const Event& e) {
        bool added = tracker_.consider(e.pid, e.parent_pid, e.name, e.qpc);
        if (!added) added = try_adopt_by_dir(e);
        if (!added) return;

        bool is_target = (e.name[0] && std::strcmp(e.name, target_) == 0);
        bool is_root   = (e.pid == tracker_.root());
        if (!main_pid_found() && (is_target || is_root)) {
            main_pid_found_.store(true, std::memory_order_release);
            anchors_.main_pid = e.pid;
        }
        if (main_pid_found()) {
            long long t1 = tracker_.earliest_start(target_);
            if (t1 == 0) t1 = tracker_.earliest_start();
            if (t1 != 0) anchors_.t1 = t1;
        }
        // The tree just grew - cached presents and windows from processes that
        // arrived before their pid was tracked may now be attributable.
        revisit_presents();
        revisit_windows();
    }

    // Install-root orphan adoption (see file header). The path check lives
    // here because only the Timeline knows the target's install directory.
    bool try_adopt_by_dir(const Event& e) {
        if (!dir_adoption_ok_ || target_dir_[0] == 0) return false;
        if (!e.name[0]) return false;
        // Same T0 discipline as name-based adoption: never claim processes
        // that pre-existed the measurement.
        if (anchors_.t0 != 0 && e.qpc != 0 && e.qpc < anchors_.t0) return false;
        char dir[MAX_PATH] = {};
        if (!query_process_dir(e.pid, dir, sizeof(dir))) return false;
        if (!path_is_under(dir, target_dir_)) return false;
        return tracker_.adopt_dir_orphan(e.pid, e.parent_pid, e.name, e.qpc);
    }

    // Query a live process's image directory (lowercased, no trailing
    // separator). Returns false if the process is gone or inaccessible.
    static bool query_process_dir(unsigned int pid, char* out, size_t out_len) {
        HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if (!h) return false;
        wchar_t wpath[MAX_PATH] = {};
        DWORD wlen = MAX_PATH;
        BOOL ok = QueryFullProcessImageNameW(h, 0, wpath, &wlen);
        CloseHandle(h);
        if (!ok) return false;
        wchar_t* slash = nullptr;
        for (wchar_t* p = wpath; *p; ++p)
            if (*p == L'\\' || *p == L'/') slash = p;
        if (slash) *slash = 0;  // truncate to directory
        char narrow[MAX_PATH] = {};
        WideCharToMultiByte(CP_ACP, 0, wpath, -1, narrow, MAX_PATH, nullptr, nullptr);
        if (!narrow[0]) return false;
        std::strncpy(out, narrow, out_len - 1);
        out[out_len - 1] = 0;
        for (char* p = out; *p; ++p) *p = (char)tolower((unsigned char)*p);
        return true;
    }

    void on_window(const Event& e) {
        // Only track windows owned by processes in our tree. Events from
        // not-yet-tracked pids are cached (bounded ring) and re-checked on
        // every tree growth: a reused instance can show its window before
        // adoption completes, and a stub's real UI process often presents
        // before install-root adoption has run.
        if (!tracker_.contains(e.pid)) {
            win_cache_[win_head_ % kWindowCache] = e;
            win_head_++;
            return;
        }
        accept_window(e);
    }

    // Record a window event for a pid that is (now) in the tree. Idempotent:
    // first timestamp wins, so revisits never distort T2/T3.
    void accept_window(const Event& e) {
        WinInfo* w = find_or_create_window(e.aux);  // aux = hwnd
        w->pid = e.pid;
        if (e.kind == Event::kWindowCreate) {
            if (w->create_qpc == 0) w->create_qpc = e.qpc;
        } else if (e.kind == Event::kWindowShow) {
            if (w->show_qpc == 0) w->show_qpc = e.qpc;
        } else if (e.kind == Event::kWindowForeground) {
            if (w->fg_qpc == 0) w->fg_qpc = e.qpc;
        }
        // T2/T3 are NOT set here - deferred to finalize_windows().
    }

    void on_window_destroy(const Event& e) {
        // Mark the window destroyed so finalize_windows() can exclude it.
        // We accept DESTROY for any hwnd we've seen (even if pid check failed
        // at CREATE time - the process may have entered the tree since).
        WinInfo* w = find_or_create_window(e.aux);
        if (!w->destroyed) {
            w->destroyed = true;
            w->destroy_qpc = e.qpc;
        }
    }

    void on_present(const Event& e) {
        // Cache every present event (bounded ring). Heavy apps may present from
        // a GPU child process BEFORE the process tree has grown to include it
        // (cold start ordering), so a present that misses the tree now might
        // match after the next tree growth - see revisit_presents().
        presents_[pres_head_ % kPresentCache] = e;
        pres_head_++;
        try_accept_present(e);
    }

    // Re-check cached presents against the (now larger) tree. Called after
    // every Process/Start that grew the tree. Accepts the earliest match.
    void revisit_presents() {
        if (first_present_seen_) return;  // already locked T4
        size_t n = pres_head_ < kPresentCache ? pres_head_ : kPresentCache;
        for (size_t i = 0; i < n; ++i) {
            const Event& e = presents_[i];
            if (e.kind != Event::kFirstPresent) continue;
            if (tracker_.contains(e.pid)) {
                // Keep the earliest matching present.
                if (anchors_.t4 == 0 || e.qpc < anchors_.t4) {
                    anchors_.t4 = e.qpc;
                    anchors_.present_event_id = e.aux;
                    first_present_seen_ = true;
                }
            }
        }
    }

    // Re-check cached windows against the (now larger) tree. Called after
    // every tree growth and after explicit adoption. Idempotent (first
    // timestamp wins), so re-running on every growth is safe.
    void revisit_windows() {
        size_t n = win_head_ < kWindowCache ? win_head_ : kWindowCache;
        for (size_t i = 0; i < n; ++i) {
            const Event& e = win_cache_[i];
            if (e.kind != Event::kWindowCreate && e.kind != Event::kWindowShow &&
                e.kind != Event::kWindowForeground) continue;
            if (tracker_.contains(e.pid)) accept_window(e);
        }
    }

    void try_accept_present(const Event& e) {
        if (!tracker_.contains(e.pid)) return;
        if (anchors_.t4 == 0 || e.qpc < anchors_.t4) {
            anchors_.t4 = e.qpc;
            anchors_.present_event_id = e.aux;
            first_present_seen_ = true;
        }
    }

    bool not_finished(long long grace_deadline_qpc,
                      long long overall_deadline_qpc) const {
        long long now = QpcClock::now();
        if (overall_deadline_qpc != 0 && now >= overall_deadline_qpc) return false;
        if (first_present_seen_ && grace_deadline_qpc != 0 &&
            now >= grace_deadline_qpc) return false;
        return true;
    }

    QpcClock&         clock_;
    PidTracker&       tracker_;
    Anchors           anchors_;
    char              target_[64] = {};
    bool              first_present_seen_ = false;
    std::atomic<bool> main_pid_found_{false};

    // Window lifetime list, accumulated during the drain loop. Small vector -
    // typical apps create a handful of top-level windows during startup.
    std::vector<WinInfo> windows_;

    // Bounded ring of recent PresentHistory events. Lets us attribute presents
    // that arrived before their GPU process entered the tree (cold-start
    // ordering) once the tree grows - revisit_presents(). The DxgKrnl session
    // forwards presents unfiltered, so this cache sees every present on the
    // system (DWM included) - hence a config-sized ring, heap-allocated so a
    // ~1MB ring doesn't blow the stack.
    static constexpr size_t kPresentCache = config::kPresentCache;
    std::vector<Event> presents_ = std::vector<Event>(kPresentCache);
    size_t              pres_head_ = 0;

    // Bounded ring of window events from not-yet-tracked pids - the window
    // counterpart of presents_, re-checked by revisit_windows().
    static constexpr size_t kWindowCache = config::kWindowCache;
    Event   win_cache_[kWindowCache] = {};
    size_t  win_head_ = 0;

    // Target install directory (lowercased, no trailing separator) and
    // whether install-root orphan adoption is allowed for it.
    char    target_dir_[MAX_PATH] = {};
    bool    dir_adoption_ok_ = false;
};

} // namespace st
