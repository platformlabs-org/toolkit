// AppTrace - measure Windows app launch -> first-window time.
//
// Measures the launch -> UI-showup time of a Windows desktop app by combining
// ETW (NT Kernel Logger Process/Start + DxgKrnl PresentHistory) and WinEvent
// (window create/show/foreground) on a single QPC timebase.
//
// Correlation is window-triggered: the target window is identified by matching
// the owning process name against the target basename. This covers native exe
// + child process tree, UWP/MSIX (via IApplicationActivationManager), and
// instance-reuse (already-running app opening a new window).
//
// Usage:
//   AppTrace.exe [options] -- <target.exe> [args...]
//
// Requires administrator privileges (NT Kernel Logger needs SeSystemProfilePrivilege).
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl_core.h>
#include <tlhelp32.h>

#include <cstdio>
#include <cstring>
#include <cctype>
#include <string>
#include <vector>
#include <thread>
#include <chrono>
#include <atomic>
#include <algorithm>

#include "Config.hpp"
#include "Options.hpp"
#include "QpcClock.hpp"
#include "EventQueue.hpp"
#include "JsonWriter.hpp"
#include "Utf8.hpp"
#include "EtwSession.hpp"
#include "KernelSession.hpp"
#include "DxgKrnlSession.hpp"
#include "WinEventHook.hpp"
#include "PidTracker.hpp"
#include "ProcessRegistry.hpp"
#include "Timeline.hpp"
#include "Launcher.hpp"
#include "Output.hpp"

using namespace st;

namespace {

// ---------------------------------------------------------------------------
// Ctrl+C / close handling: ensure ETW sessions are torn down even when the
// user interrupts the run. Without this, a Ctrl+C leaves an orphan NT Kernel
// Logger holding the system singleton, breaking all subsequent runs.
// We keep a pointer to the active capture's sessions and stop them from the
// console-control handler. The handler runs on a separate thread under
// time pressure, so we only flip an atomic flag; the main drain loop notices
// and exits, letting normal RAII teardown run.
// ---------------------------------------------------------------------------
struct ActiveCapture {
    KernelSession*   kernel = nullptr;
    DxgKrnlSession*  dxg    = nullptr;
    WinEventHook*    winev  = nullptr;
    std::atomic<bool> interrupted{false};
};
ActiveCapture* g_active = nullptr;

BOOL WINAPI console_ctrl_handler(DWORD ctrl) {
    (void)ctrl;
    if (g_active) g_active->interrupted.store(true, std::memory_order_release);
    // Tell the system we handled it so the process isn't killed before cleanup.
    Sleep(500);
    return TRUE;
}

bool is_elevated() {
    BOOL f = FALSE;
    HANDLE tok = nullptr;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &tok)) {
        TOKEN_ELEVATION e{};
        DWORD ret = 0;
        if (GetTokenInformation(tok, TokenElevation, &e, sizeof(e), &ret))
            f = e.TokenIsElevated;
        CloseHandle(tok);
    }
    return f != FALSE;
}

// Detect whether this process runs in the physical console session (session 1)
// or a network/RDP session. GPU-bound apps (e.g. JianyingPro) and many GUI
// apps only create windows in the console session; measuring from a network
// session yields zero windows. Returns true if we're in the active console.
bool is_console_session() {
    DWORD console = WTSGetActiveConsoleSessionId();
    if (console == 0xFFFFFFFF) return false;
    DWORD my_session = 0;
    DWORD pid = GetCurrentProcessId();
    if (!ProcessIdToSessionId(pid, &my_session)) return false;
    return my_session == console;
}

// True when this process is the ONLY one attached to the console: the window
// was created for us (double-click in Explorer, `start` from cmd) and closes
// the instant we exit, taking everything we printed with it. In a regular
// terminal the shell is attached too, so the text survives our exit.
bool owns_console_window() {
    DWORD pids[8] = {};
    DWORD n = GetConsoleProcessList(pids, 8);
    return n == 1;
}

// Keep a double-clicked launch readable: hold the throwaway console open
// until the user presses Enter. No-op when stdout goes to a persistent
// terminal (or no console at all), so scripted use never blocks.
void wait_for_enter_before_exit() {
    if (!owns_console_window()) return;
    std::fprintf(stdout, "\nPress Enter to exit...");
    std::fflush(stdout);
    int c;
    while ((c = std::fgetc(stdin)) != '\n' && c != '\r' && c != EOF) {}
}

bool enable_privilege(LPCSTR priv) {
    HANDLE tok = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(),
                          TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &tok))
        return false;
    LUID luid{};
    if (!LookupPrivilegeValueA(nullptr, priv, &luid)) {
        CloseHandle(tok);
        return false;
    }
    TOKEN_PRIVILEGES tp{};
    tp.PrivilegeCount = 1;
    tp.Privileges[0].Luid = luid;
    tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
    BOOL ok = AdjustTokenPrivileges(tok, FALSE, &tp, sizeof(tp), nullptr, nullptr);
    DWORD err = GetLastError();
    CloseHandle(tok);
    return ok && err == ERROR_SUCCESS;
}

// Tool identity. Bump on user-visible behavior/output changes; shown by
// --version and in the --help banner.
constexpr char kVersion[] = "1.0.0";

void print_usage(FILE* f) {
    const std::string banner = std::string("AppTrace v") + kVersion +
        " - measure Windows app launch -> first-window time";
    std::fprintf(f, "%s\n", banner.c_str());
    // Contact right-aligned under the banner's right edge.
    std::fprintf(f, "%*s\n", (int)banner.size(), "liuty24@lenovo.com");
    std::fprintf(f,
        "\nUsage: AppTrace.exe [options] -- <target> [args...]\n\n"
        "Target (pick one):\n"
        "  app.exe | app.lnk      launch a specific program / shortcut\n"
        "  <document>             open the file with its DEFAULT associated\n"
        "                         app, exactly like double-clicking it\n"
        "                         (e.g. report.xlsx -> Excel, movie.mkv -> player)\n\n"
        "Options:\n"
        "  -o, --output <file>   append a JSONL record to <file>\n"
        "      --uwp <aumid>     launch a UWP/MSIX app via its App User Model ID\n"
        "                         (e.g. Microsoft.WindowsNotepad_8wekyb3d8bbwe!App);\n"
        "                         pass the package exe path as the target\n"
        "      --pname <name>    override the process-name key for window matching\n"
        "                         (e.g. olk.exe for Outlook, when the real process\n"
        "                         name differs from the target exe)\n"
        "      --batch <file>    measure every app listed in <file> (one command\n"
        "                         line per entry; '#' starts a comment) and print\n"
        "                         a summary table\n"
        "      --csv             emit a CSV row to stdout (default: one-line JSON)\n"
        "      --no-winevent     skip the WinEvent channel (only T0/T1/T4)\n"
        "      --timeout <sec>   overall capture timeout (default 30)\n"
        "      --grace <sec>     extra capture after the first frame (default 3)\n"
        "      --runs <n>        number of measured runs (default 1)\n"
        "      --warmup <n>      warmup runs not counted (default 0)\n"
        "      --debug           print per-channel diagnostics to stderr\n"
        "      --keep            keep the target app running after capture\n"
        "                         (default: terminate it once data is captured)\n"
        "      --cleanup         stop any stuck NT Kernel Logger session then exit\n"
        "  -V, --version         print version (and build date) then exit\n"
        "  -h, --help            show this help\n\n"
        "Timeline milestones:\n"
        "  T0  launch call (CreateProcess) - when the clock starts\n"
        "  T1  the first TARGET process starts: the launched exe itself, or\n"
        "      the real app behind a launcher/stub chain (1-2ms for direct\n"
        "      launches; stub hops add their forwarding time)\n"
        "  T2  main window created (exists, may still be invisible)\n"
        "  T3  main window shown - the user SEES the window frame\n"
        "  T4  first frame submitted to the GPU (content rendered)\n"
        "  Note: T4's position varies - apps often render before showing,\n"
        "  so T4 may arrive before (even long before) T3.\n"
        "\n"
        "                          T0        T1        T2        T3        T4\n"
        "                          |         |         |         |         |\n"
        "time_to_process_ms        +---------+         |         |         |\n"
        "process_to_window_ms                +---------+         |         |\n"
        "time_to_window_ms (*)     +-----------------------------+         |\n"
        "window_to_frame_ms                            +---------+---------+\n"
        "time_to_first_frame_ms    +---------------------------------------+\n"
        "\n"
        "Output fields (JSON/CSV):\n"
        "  target                  measured app: image basename or document name\n"
        "  main_pid                the process this run correlated to (first\n"
        "                          target-named tree member; falls back to the\n"
        "                          launched pid when nothing matched)\n"
        "  time_to_window_ms (*)   PRIMARY. launch -> the user sees the main\n"
        "                          window frame (works for every GUI app)\n"
        "  time_to_process_ms      launch -> the first target process starts\n"
        "                          (1-2ms direct; longer via launcher/stub chains)\n"
        "  process_to_window_ms    process start -> main window created\n"
        "  time_to_first_frame_ms  launch -> first frame submitted to the GPU.\n"
        "                          Only flip-model DirectX apps report this;\n"
        "                          GDI and DWM-composited apps stay empty (0)\n"
        "  window_to_frame_ms      main window created -> first frame\n"
        "                          (0 when the frame predates window creation:\n"
        "                          render-before-show apps)\n"
        "  first_frame_seen        whether a first-frame (Present) was captured\n"
        "  first_frame_timeout     capture ended without any first frame\n"
        "  first_frame_event_id    ETW event id that marked the frame (173/171/184)\n"
        "  JSONL only: adopted / reuse_adopted / tracker_count / qpc_freq\n"
        "              (correlation diagnostics for analysis)\n\n"
        "Must be run as administrator (right-click -> Run as administrator).\n");
}

bool parse_args(int argc, char** argv, Options& o, std::string& err) {
    int i = 1;
    bool saw_double_dash = false;
    while (i < argc) {
        std::string a = argv[i];
        auto next_int = [&](int& out) -> bool {
            if (i + 1 >= argc) { err = "missing value for " + a; return false; }
            out = std::atoi(argv[++i]);
            return true;
        };
        auto next_str = [&](std::string& out) -> bool {
            if (i + 1 >= argc) { err = "missing value for " + a; return false; }
            out = argv[++i];
            return true;
        };

        if (a == "--") { saw_double_dash = true; ++i; break; }
        if (a == "-V" || a == "--version") {
            std::printf("AppTrace v%s (built %s)\n", kVersion, __DATE__);
            wait_for_enter_before_exit();
            std::exit(0);
        }
        if (a == "-h" || a == "--help") {
            print_usage(stdout);
            wait_for_enter_before_exit();
            std::exit(0);
        }
        if (a == "--cleanup") { o.cleanup_only = true; ++i; continue; }
        if (a == "--debug")   { o.debug = true; ++i; continue; }
        if (a == "-o" || a == "--output") { if (!next_str(o.output_file)) return false; }
        else if (a == "--uwp")    { if (!next_str(o.aumid)) return false; }
        else if (a == "--pname")  { if (!next_str(o.pname)) return false; }
        else if (a == "--batch")  { if (!next_str(o.batch_file)) return false; }
        else if (a == "--keep")   { o.keep_alive = true; }
        else if (a == "--csv")      { o.csv = true; }
        else if (a == "--no-winevent") { o.no_winevent = true; }
        else if (a == "--timeout")  { if (!next_int(o.timeout_sec)) return false; }
        else if (a == "--grace")    { if (!next_int(o.grace_sec)) return false; }
        else if (a == "--runs")     { if (!next_int(o.runs)) return false; }
        else if (a == "--warmup")   { if (!next_int(o.warmup)) return false; }
        else if (a.size() > 0 && a[0] == '-') {
            err = "unknown option: " + a;
            return false;
        } else {
            // First positional starts the target command (no -- needed).
            saw_double_dash = true;
            break;
        }
        ++i;
    }

    if (!saw_double_dash || i >= argc) {
        // --cleanup and --batch are standalone commands that need no target.
        if (o.cleanup_only || !o.batch_file.empty()) return true;
        err = "no target command given (use -- <target.exe> [args...])";
        return false;
    }
    o.target_exe = argv[i++];
    while (i < argc) o.target_args.emplace_back(argv[i++]);
    return true;
}

// Reuse-scenario adoption, fallback pass: scan LIVE processes for an image
// whose basename matches the target. Needed when the reused instance
// pre-dates our capture window (e.g. Edge's startup-boost browser process,
// running since logon), so the ETW ProcessRegistry never recorded its start.
// Such pids are adopted with start_qpc=0; teardown treats registry-missing
// tree members as pre-existing (close-only, never force-killed).
bool adopt_live_by_name(PidTracker& tracker, const std::string& target) {
    std::string lt = lowered(target);

    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return false;
    bool adopted = false;
    PROCESSENTRY32W pe{};
    pe.dwSize = sizeof(pe);
    if (Process32FirstW(snap, &pe)) {
        do {
            char name[config::kRegistryNameLen] = {};
            WideCharToMultiByte(CP_ACP, 0, pe.szExeFile, -1, name,
                                sizeof(name), nullptr, nullptr);
            std::string lname = lowered(name);
            if (lt == lname) {
                if (tracker.adopt_existing(pe.th32ProcessID, lname.c_str(), 0))
                    adopted = true;
            }
        } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
    return adopted;
}

// Reuse-scenario adoption: scan the registry for a pre-existing process whose
// lowercased image name matches the target, and adopt it into the tracker so
// its Present/Window events are correlated. Triggered when the launched pid
// exits quickly (a sign of instance reuse). Returns true if adopted.
bool try_adopt_reuse(PidTracker& tracker, ProcessRegistry& reg,
                     const std::string& target) {
    // Lowercase target for comparison (registry names are already lowercased).
    std::string lt = lowered(target);
    bool adopted = false;
    reg.for_each([&](const ProcessInfo& pi) {
        if (pi.image_name[0] && std::strcmp(pi.image_name, lt.c_str()) == 0) {
            if (tracker.adopt_existing(pi.pid, pi.image_name, pi.start_qpc)) {
                adopted = true;
            }
        }
        return true;  // keep scanning
    });
    if (!adopted) adopted = adopt_live_by_name(tracker, target);
    return adopted;
}

RunResult capture_once(const Options& o, QpcClock& clock) {
    RunResult r;

    EventQueue       q;                          // window/process events
    EventQueue       present_q(config::kPresentQueueCapacity);  // high-rate presents
    PidTracker       tracker;
    ProcessRegistry  registry;

    KernelSession   kernel;
    DxgKrnlSession  dxg;
    WinEventHook    winev;

    ActiveCapture ac{ &kernel, &dxg, o.no_winevent ? nullptr : &winev, {} };
    g_active = &ac;
    SetConsoleCtrlHandler(&console_ctrl_handler, TRUE);

    // COM is required for IApplicationActivationManager (UWP launch).
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    dxg.debug.store(o.debug, std::memory_order_release);
    winev.debug.store(o.debug, std::memory_order_release);

    // Start ETW sessions BEFORE launching so we never miss early events.
    if (!kernel.start(&q, &registry)) {
        std::fprintf(stderr,
            "Failed to start NT Kernel Logger (err=%lu).\n"
            "  Another tool may hold it (xperf/WPR/Visual Studio). Close it,\n"
            "  or run 'AppTrace.exe --cleanup' and retry.\n",
            kernel.last_error());
        g_active = nullptr;
        SetConsoleCtrlHandler(&console_ctrl_handler, FALSE);
        CoUninitialize();
        return r;
    }
    // The DxgKrnl session forwards ALL PresentHistory events on its own queue
    // (no pid filter): a GPU child can present before its Process/Start has
    // grown the tree, and Timeline caches + re-attributes those.
    bool dxg_ok = dxg.start(&present_q);
    if (!dxg_ok) {
        std::fprintf(stderr,
            "Warning: DxgKrnl session unavailable (err=%lu). "
            "Continuing without First Present (T4) metrics.\n",
            dxg.last_error());
    }
    if (!o.no_winevent) {
        winev.start(&q);
    }

    Sleep(20);

    // The process-name key used for window matching. The ProcessRegistry stores
    // lowercased image basenames WITH extension (e.g. "winver.exe"). Derived
    // from the target exe path; for DOCUMENT targets (opened with the default
    // associated app) it comes from the shell association instead - e.g.
    // "file.xlsx" -> EXCEL.EXE. --pname overrides all of this.
    std::string name_key;
    std::string assoc_exe;  // default handler exe for document targets
    std::string assoc_dir;  // install dir of the default handler (documents)
    if (!o.pname.empty()) {
        name_key = o.pname;
    } else if (is_document_target(o.target_exe)) {
        assoc_exe = query_association(o.target_exe);
        if (!assoc_exe.empty()) {
            name_key  = basename_of(assoc_exe);
            size_t s = assoc_exe.find_last_of("\\/");
            if (s != std::string::npos) assoc_dir = assoc_exe.substr(0, s);
            if (o.debug) {
                std::fprintf(stderr, "[doc] default handler: %s\n",
                             to_utf8(assoc_exe).c_str());
            }
        } else {
            // UWP-owned or exotic association: no exe to key on. Keep the doc
            // name so the not-found note at the end is at least informative.
            name_key = basename_of(o.target_exe);
            std::fprintf(stderr,
                "Note: '%s' has no executable association (UWP-owned?). "
                "Pass the handler exe name via --pname if correlation fails.\n",
                to_utf8(o.target_exe).c_str());
        }
    } else {
        name_key = basename_of(o.target_exe);
    }

    // T0: stamp immediately before launch.
    long long t0 = QpcClock::now();

    // Document mode: launch the DEFAULT handler directly with the file as its
    // argument (the handler was resolved from the shell association above).
    // No ShellExecute: this process runs elevated, and the shell's consent
    // handling for an unelevated handler pops dialogs on the user's desktop
    // (and the launched pid becomes a proper tree root this way).
    Options eff = o;
    if (is_document_target(o.target_exe) && !assoc_exe.empty()) {
        eff.target_exe = assoc_exe;
        eff.target_args.insert(eff.target_args.begin(), o.target_exe);
    }

    LaunchResult lr = launch_target(eff);
    unsigned int launched_pid = lr.pid;
    if (launched_pid == 0) {
        r.timed_out = true;
        g_active = nullptr;
        SetConsoleCtrlHandler(&console_ctrl_handler, FALSE);
        CoUninitialize();
        return r;
    }

    // Refine name_key from the REAL process image path. The target_exe may be a
    // short (8.3) path like "PHOTOS~1.EXE", but the ProcessRegistry stores the
    // full name ("Photoshop.exe") from QueryFullProcessImageName. Without this
    // refinement, orphan adoption fails because the names don't match.
    // The same query also yields the install DIRECTORY, which enables
    // install-root orphan adoption in the Timeline (stub -> real app in a
    // versioned subdirectory, e.g. Soda Music). For documents the association
    // handler's dir pre-fills it (skipped below when there is no pid, i.e.
    // the shell handed the open to an existing instance).
    char target_dir[MAX_PATH] = {};
    if (!assoc_dir.empty()) {
        std::strncpy(target_dir, assoc_dir.c_str(), sizeof(target_dir) - 1);
    }
    if (o.pname.empty() && launched_pid != 0) {
        HANDLE hp = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, launched_pid);
        if (hp) {
            wchar_t wpath[MAX_PATH] = {};
            DWORD wlen = MAX_PATH;
            if (QueryFullProcessImageNameW(hp, 0, wpath, &wlen)) {
                const wchar_t* base = wpath;
                const wchar_t* slash = nullptr;
                for (const wchar_t* p = wpath; *p; ++p)
                    if (*p == L'\\' || *p == L'/') { base = p + 1; slash = p; }
                char narrow[MAX_PATH] = {};
                WideCharToMultiByte(CP_ACP, 0, base, -1, narrow, MAX_PATH, nullptr, nullptr);
                if (narrow[0]) name_key = narrow;
                if (slash) {
                    wchar_t wdir[MAX_PATH] = {};
                    size_t dlen = (size_t)(slash - wpath);
                    if (dlen < MAX_PATH) {
                        std::wcsncpy(wdir, wpath, dlen);
                        wdir[dlen] = 0;
                        WideCharToMultiByte(CP_ACP, 0, wdir, -1, target_dir,
                                            MAX_PATH, nullptr, nullptr);
                    }
                }
            }
            CloseHandle(hp);
        }
    }

    Timeline tl(clock, tracker, name_key.c_str());
    tl.set_t0(t0);
    tl.set_target_dir(target_dir);
    // Establish the process-tree root immediately. The tree is grown in real
    // time from ETW Process/Start events (parent chain + orphan adoption),
    // so we don't wait for a window. This captures multi-process apps and
    // repairs broken parent links (stub->real exe) as soon as the target-
    // named process appears. Shell-doc handoffs (pid 0) skip the root and
    // rely on name-orphan/reuse adoption instead.
    if (launched_pid != 0) {
        tracker.set_root(launched_pid, t0);
    }

    long long freq = clock.freq();
    long long grace_qpc    = 0;
    long long deadline_qpc = t0 + (long long)o.timeout_sec * freq;
    long long last_adopt_try_qpc = 0;  // reuse-adoption retry cadence

    // Drain loop.
    while (true) {
        if (ac.interrupted.load(std::memory_order_acquire)) {
            std::fprintf(stderr, "\n[interrupted - stopping sessions cleanly]\n");
            break;
        }
        bool more = tl.drain_one(q, present_q, grace_qpc, deadline_qpc);
        if (!more) break;

        if (tl.first_present_seen() && grace_qpc == 0) {
            grace_qpc = QpcClock::now() + (long long)o.grace_sec * freq;
        }

        // Reuse-scenario adoption, retried on a cadence while we have neither
        // a window nor a present. A single exit-triggered attempt is not
        // enough: the launched forwarder may STAY alive (Edge startup boost
        // keeps an idle process around), and ETW can miss the root's start,
        // so neither "launched pid exited" nor tracker contents are reliable
        // signals. The scan only adopts NOT-yet-tracked same-name processes -
        // for a normal launch there are none, so retrying is harmless. The
        // first window typically appears well after the first scan, so this
        // also catches fast reuse windows that outran the old settle delay.
        if (tl.anchors().t2 == 0 && !tl.first_present_seen()) {
            long long now = QpcClock::now();
            bool first_due = (last_adopt_try_qpc == 0 &&
                              now - t0 >= 2 * freq);
            bool retry_due = (last_adopt_try_qpc != 0 &&
                              now - last_adopt_try_qpc >= 2 * freq);
            if (first_due || retry_due) {
                last_adopt_try_qpc = now;
                if (try_adopt_reuse(tracker, registry, name_key)) {
                    tl.on_adoption();
                    if (o.debug) {
                        std::fprintf(stderr,
                            "[reuse] adopted pre-existing target process\n");
                    }
                }
            }
        }

        if (q.empty() && present_q.empty()) Sleep(2);

        // Stop early if the matched main process has exited AND we've already
        // seen its window. We only check the *matched* process (not the launched
        // one, which may be a short-lived alias for UWP/reuse scenarios).
        if (tl.main_pid_found()) {
            unsigned int main = tl.anchors().main_pid;
            HANDLE hp = OpenProcess(SYNCHRONIZE, FALSE, main);
            if (hp) {
                DWORD w = WaitForSingleObject(hp, 0);
                CloseHandle(hp);
                if (w == WAIT_OBJECT_0 && tl.first_present_seen()) break;
            }
        }
    }

    // The drain loop has ended (first present + grace, or timeout). Now that
    // all window CREATE/SHOW/DESTROY events have been collected, finalize T2/T3
    // by selecting the real main window from the tracked lifetimes. Splash
    // windows (destroyed during capture) are excluded; the latest-persisting
    // window wins.
    tl.finalize_windows();
    if (o.debug) tl.dump_windows();

    const Anchors& a = tl.anchors();
    // T3 falls back to T2 when no SHOW was observed (RDP/non-interactive).
    long long t3_eff = (a.t3 != 0) ? a.t3 : a.t2;
    r.main_pid              = a.main_pid ? a.main_pid : launched_pid;
    r.time_to_first_frame_ms = tl.ms(a.t0, a.t4);
    r.time_to_window_ms      = tl.ms(a.t0, t3_eff);
    r.time_to_process_ms     = tl.ms(a.t0, a.t1);
    r.process_to_window_ms   = tl.ms(a.t1, a.t2);
    r.window_to_frame_ms     = tl.ms(a.t2, a.t4);
    r.first_frame_seen       = tl.first_present_seen();
    r.first_frame_event_id   = a.present_event_id;
    // "timed out" only makes sense if we were actually watching for presents
    // and never saw one. If DxgKrnl was unavailable, we just report what we have.
    r.timed_out = dxg_ok && !tl.first_present_seen() &&
                  !ac.interrupted.load(std::memory_order_acquire);
    r.adopted       = tracker.adopted_any();
    r.reuse_adopted = tracker.reuse_adopted();
    r.tracker_count = tracker.count();

    // Diagnostics to stderr in --debug mode (never to stdout).
    if (o.debug) {
        std::fprintf(stderr,
            "[diag] kernel: total=%zu process=%zu recorded=%zu lost=%lu | "
            "dxg: total=%zu present=%zu pushed=%zu pdrops=%zu ok=%d | "
            "winev: total=%zu captured=%zu | "
            "registry=%zu tracker=%zu adopted=%d main_pid=%u found=%d | "
            "t0=%lld t1=%lld t2=%lld t3=%lld t4=%lld\n",
            kernel.total_events.load(), kernel.process_events.load(),
            kernel.process_start_recorded.load(), kernel.events_lost(),
            dxg.total_events.load(), dxg.present_events.load(),
            dxg.pushed_presents.load(), present_q.drops(), dxg_ok ? 1 : 0,
            winev.total_events.load(), winev.captured.load(),
            registry.count(), tracker.count(), tracker.adopted_any() ? 1 : 0,
            a.main_pid, tl.main_pid_found() ? 1 : 0,
            a.t0, a.t1, a.t2, a.t3, a.t4);
    }

    // If the target process was never adopted into the tree, explain why.
    if (!tl.main_pid_found()) {
        ProcessInfo pi{};
        bool reg_hit = registry.lookup(launched_pid, pi);
        std::fprintf(stderr,
            "Note: target process '%s' not found in the process tree.\n"
            "      The tree is grown from ETW Process/Start events (parent chain\n"
            "      + orphan adoption by name). launched_pid=%u registry_hit=%d "
            "reg_name='%s' tracker=%zu.\n"
            "      If the real process name differs, use --pname to override.\n",
            to_utf8(name_key).c_str(), launched_pid, reg_hit ? 1 : 0,
            reg_hit ? to_utf8(pi.image_name).c_str() : "<not in registry>",
            tracker.count());
    }

    // Clear the global before RAII teardown so a late Ctrl+C doesn't dangle.
    g_active = nullptr;
    SetConsoleCtrlHandler(&console_ctrl_handler, FALSE);

    // Tear down the measured app so it doesn't linger. We kill only processes
    // that started during this run (start_qpc >= t0), so pre-existing reused
    // instances are never harmed. --keep disables this.
    if (!o.keep_alive) {
        terminate_tree(launched_pid, tracker, registry, t0, o.debug);
    }

    CoUninitialize();

    // RAII dtors stop sessions and join consumer threads.
    return r;
}

} // namespace

int main(int argc, char** argv) {
    Options o;
    std::string err;
    if (!parse_args(argc, argv, o, err)) {
        std::fprintf(stderr, "error: %s\n\n", err.c_str());
        print_usage(stderr);
        wait_for_enter_before_exit();
        return kExitUsage;
    }

    if (!is_elevated()) {
        std::fprintf(stderr,
            "ERROR: must run as administrator.\n"
            "       Right-click AppTrace.exe -> 'Run as administrator'.\n"
            "       (The NT Kernel Logger needs SeSystemProfilePrivilege.)\n");
        wait_for_enter_before_exit();
        return kExitNotAdmin;
    }
    // Best-effort: enable the privilege explicitly.
    enable_privilege("SeSystemProfilePrivilege");
    enable_privilege("SeDebugPrivilege");

    // All human-visible output (labels, JSON, diagnostics with paths) is
    // UTF-8; switch the console to match so on-screen text isn't mojibake.
    SetConsoleOutputCP(CP_UTF8);

    // --cleanup: force-stop any stuck sessions then exit.
    if (o.cleanup_only) {
        bool stopped = EtwSession::force_stop_kernel_logger();
        size_t stale = EtwSession::stop_stale_sessions(L"AppTrace-DxgKrnl") +
                       EtwSession::stop_stale_sessions(L"StartupTime-DxgKrnl");
        std::printf("NT Kernel Logger: %s\n",
                    stopped ? "stopped (was running)" : "not running");
        std::printf("Stale DxgKrnl sessions stopped: %zu\n", stale);
        return 0;
    }

    QpcClock& clock = QpcClock::instance();

    // COM is needed for .lnk shortcut resolution (and for UWP activation inside
    // capture_once). Init once here; nested CoInitializeEx in capture_once is a
    // no-op that returns S_FALSE.
    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    // Resolve .lnk shortcuts to their target exe + args in place, so the rest
    // of the pipeline works against the real exe path/name.
    maybe_resolve_shortcut(o);

    // Session awareness: GPU-bound and many GUI apps only create windows in
    // the physical console session. Warn (don't block) when running from a
    // network/RDP session where window capture may yield nothing.
    if (!is_console_session() && !o.no_winevent) {
        std::fprintf(stderr,
            "Warning: not running in the physical console session.\n"
            "         Some GUI apps (GPU-bound, UWP) won't create windows here,\n"
            "         yielding zero T2/T3. Run from the console session for\n"
            "         reliable window capture, or use --no-winevent for T0/T1/T4.\n");
    }

    // The display label derives from the REAL (long-path) exe name, not the
    // raw user input: 8.3 short paths like "PHOTOS~1.EXE" would otherwise show
    // up as "PHOTOS~1" instead of "Photoshop.exe". GetLongPathNameW requires
    // the file to exist, so fall back to the input basename if it fails (e.g.
    // a bare command name resolved via PATH). The label is emitted as UTF-8 so
    // Chinese app names survive every consumer downstream.
    auto label_for = [](const std::string& target) -> std::string {
        wchar_t wexe[MAX_PATH] = {};
        MultiByteToWideChar(CP_ACP, 0, target.c_str(), -1, wexe, MAX_PATH);
        wchar_t wlong[MAX_PATH] = {};
        std::string source = target;
        if (GetLongPathNameW(wexe, wlong, MAX_PATH) > 0) {
            char narrow[MAX_PATH] = {};
            WideCharToMultiByte(CP_ACP, 0, wlong, -1, narrow, MAX_PATH, nullptr, nullptr);
            if (narrow[0]) source = narrow;
        }
        // Keep the full basename WITH extension (e.g. "Photoshop.exe") - it's
        // the same key used for process-name correlation.
        return to_utf8(basename_of(source));
    };

    // ---- batch mode: measure every app listed in --batch <file>, summarize ----
    if (!o.batch_file.empty()) {
        std::vector<std::string> lines;
        {
            FILE* bf = nullptr;
            if (fopen_s(&bf, o.batch_file.c_str(), "r") != 0 || !bf) {
                std::fprintf(stderr, "error: cannot open batch file: %s\n",
                             o.batch_file.c_str());
                return kExitUsage;
            }
            char line[1024];
            while (fgets(line, sizeof(line), bf)) {
                std::string s = line;
                // Trim whitespace; skip blanks and # comments.
                size_t b = s.find_first_not_of(" \t\r\n");
                if (b == std::string::npos || s[b] == '#') continue;
                size_t e = s.find_last_not_of(" \t\r\n");
                lines.push_back(s.substr(b, e - b + 1));
            }
            fclose(bf);
        }
        if (lines.empty()) {
            std::fprintf(stderr, "error: batch file has no entries\n");
            return kExitUsage;
        }

        std::printf("--- batch: %d app(s) ---\n", (int)lines.size());
        struct BatchRow { std::string label; RunResult r; };
        std::vector<BatchRow> rows;
        bool any_present = false;
        for (size_t li = 0; li < lines.size(); ++li) {
            // Split the line into exe + args (quote-aware, simple).
            Options bo = o;
            bo.batch_file.clear();
            bo.target_exe.clear();
            bo.target_args.clear();
            bo.aumid.clear();      // batch entries are exe/lnk paths
            bo.pname.clear();
            {
                const std::string& s = lines[li];
                size_t i = 0;
                auto next_token = [&]() -> std::string {
                    std::string tok;
                    if (i < s.size() && (s[i] == '"' || s[i] == '\'')) {
                        char q = s[i++];
                        while (i < s.size() && s[i] != q) tok += s[i++];
                        if (i < s.size()) ++i;
                    } else {
                        while (i < s.size() && s[i] != ' ' && s[i] != '\t') tok += s[i++];
                    }
                    while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) ++i;
                    return tok;
                };
                bo.target_exe = next_token();
                std::string tok;
                while (!(tok = next_token()).empty()) bo.target_args.push_back(tok);
            }
            if (bo.target_exe.empty()) continue;

            std::printf("[%d/%d] %s\n", (int)li + 1, (int)lines.size(),
                        label_for(bo.target_exe).c_str());
            maybe_resolve_shortcut(bo);
            RunResult r = capture_once(bo, clock);
            write_output(bo, r, clock, label_for(bo.target_exe).c_str());
            if (r.first_frame_seen) any_present = true;
            rows.push_back({label_for(bo.target_exe), r});
            if (li + 1 < lines.size()) {
                Sleep(2000);  // let the previous app unwind before the next
            }
        }

        // Compact summary table.
        std::printf("\n%-28s %14s %14s %8s\n", "app", "window_ms", "frame_ms", "frame");
        std::printf("%-28s %14s %14s %8s\n", "----", "---------", "--------", "-----");
        for (auto& row : rows) {
            std::printf("%-28s %14.1f %14.1f %8s\n",
                        row.label.c_str(),
                        row.r.time_to_window_ms,
                        row.r.time_to_first_frame_ms,
                        row.r.first_frame_seen ? "yes" : "-");
        }
        return any_present ? kExitOk : kExitPartial;
    }

    std::string label = label_for(o.target_exe);

    // Warmup runs (not reported). These heat OS file caches so measured runs
    // reflect a "warm" start. Each warmup run terminates the app, then we wait
    // for the process tree to fully exit before continuing.
    for (int i = 0; i < o.warmup; ++i) {
        Options wo = o; wo.output_file.clear();
        capture_once(wo, clock);
        Sleep(1500); // let processes unwind + file caches settle
    }

    if (o.csv) print_csv_header();

    std::vector<RunResult> results;
    for (int i = 0; i < o.runs; ++i) {
        RunResult r = capture_once(o, clock);
        write_output(o, r, clock, label.c_str());
        results.push_back(r);
        if (i + 1 < o.runs) Sleep(1000);
    }

    // Summary when multiple runs.
    if (o.runs > 1) {
        print_summary(results, o.csv);
    }

    // Choose a structured exit code from the collected results so CI/scripts
    // can branch without parsing output. Priority: any T4 success > any
    // correlation (main_pid) > nothing matched.
    bool any_present = false, any_correlated = false;
    for (auto& r : results) {
        if (r.first_frame_seen) any_present = true;
        if (r.main_pid != 0) any_correlated = true;
    }
    int code = any_present ? kExitOk
             : any_correlated ? kExitPartial
             : kExitNoCorrelation;
    return code;
}
