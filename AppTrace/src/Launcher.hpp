// Launcher.hpp - Target launch strategies + process-tree teardown.
//
// Everything that turns an Options struct into a running process:
//   - CreateProcessW            for plain exes
//   - ShellExecuteExW ("open")  for documents: opens them with the DEFAULT
//                               associated app, exactly like a user
//                               double-clicking the file
//   - IApplicationActivationMgr for UWP/MSIX (needs an AUMID via --uwp)
//   - IShellLinkW               for .lnk shortcut resolution (in place)
// plus the symmetric terminate_tree() that tears down exactly the processes
// brought up during a run - and never pre-existing reused instances.
//
// The pid returned by launch_target() is a *hint*; for UWP aliases, instance
// reuse and shell-defaulted documents the real window process may differ (or
// there may be no new process at all) - it is resolved later by the Timeline's
// process-name matching and adoption paths. Functions are `inline`
// (header-only, ODR safe) to match the rest of the codebase's style.
#pragma once
#include "Options.hpp"
#include "PidTracker.hpp"
#include "ProcessRegistry.hpp"
#include "Utf8.hpp"

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <tlhelp32.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#include <cctype>

namespace st {

// How the target was brought up.
enum class LaunchKind { kCreateProcess, kActivateApp };

struct LaunchResult {
    unsigned int pid = 0;          // launched process (hint; may be 0/irrelevant)
    LaunchKind   kind = LaunchKind::kCreateProcess;
};

// True when the path names an existing file that is NOT itself executable -
// i.e. a document that should be opened with its default associated app.
// .lnk is excluded (resolved separately); script extensions (.bat/.cmd) count
// as executable.
inline bool is_document_target(const std::string& path) {
    static const char* kRunnable[] = { ".exe", ".com", ".bat", ".cmd", ".lnk", ".scr", ".pif" };
    std::string low = path;
    for (char& c : low) c = (char)tolower((unsigned char)c);
    for (auto ext : kRunnable) {
        size_t n = std::strlen(ext);
        if (low.size() >= n && low.compare(low.size() - n, n, ext) == 0) return false;
    }
    DWORD attrs = GetFileAttributesA(path.c_str());
    return attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY);
}

// Resolve the DEFAULT handler executable for a document (the app the shell
// would launch on double-click). Best-effort: returns an empty string for
// UWP-owned or exotic associations; callers must tolerate that.
inline std::string query_association(const std::string& doc_path) {
    // Extract the extension (with the dot); ShellExecute keys off it.
    std::string ext;
    size_t dot = doc_path.find_last_of('.');
    size_t slash = doc_path.find_last_of("\\/");
    if (dot == std::string::npos) return {};
    if (slash != std::string::npos && dot < slash) return {};
    ext = doc_path.substr(dot);

    wchar_t wext[64] = {};
    MultiByteToWideChar(CP_ACP, 0, ext.c_str(), -1, wext, 64);
    wchar_t wbuf[MAX_PATH] = {};
    DWORD len = MAX_PATH;
    HRESULT hr = AssocQueryStringW(ASSOCF_INIT_IGNOREUNKNOWN, ASSOCSTR_EXECUTABLE,
                                    wext, L"open", wbuf, &len);
    if (FAILED(hr) || len == 0 || !wbuf[0]) return {};
    // Some handlers come back quoted; strip surrounding quotes.
    wchar_t* b = wbuf;
    if (*b == L'"') ++b;
    wchar_t* e = b + std::wcslen(b);
    if (e > b && *(e - 1) == L'"') *(e - 1) = 0;

    char narrow[MAX_PATH] = {};
    WideCharToMultiByte(CP_ACP, 0, b, -1, narrow, MAX_PATH, nullptr, nullptr);
    return narrow;
}

// Open a document with its default associated app: the CALLER resolves the
// handler via query_association() and launches it directly with the file as
// an argument (see main.cpp). This header deliberately does NOT use
// ShellExecute for documents: AppTrace runs elevated, and the shell's
// consent handling for an unelevated handler pops a dialog on the user's
// desktop (or fails with ERROR_CANCELLED, 1223). Direct CreateProcess picks
// the same program (same association) without any UI.

// Build a wide command line from target + args (used by CreateProcessW).
inline std::wstring build_wcmdline(const std::string& exe,
                                   const std::vector<std::string>& args) {
    std::wstring cmd = L"\"" + to_wide(exe) + L"\"";
    for (const auto& a : args) {
        cmd += L" ";
        std::wstring wa = to_wide(a);
        if (wa.find(L' ') != std::wstring::npos) cmd += L"\"" + wa + L"\"";
        else cmd += wa;
    }
    return cmd;
}

// Launch a plain exe via CreateProcessW. Returns the new pid (hint).
inline unsigned int launch_createprocess(const std::string& exe,
                                         const std::vector<std::string>& args) {
    std::wstring wcmd = build_wcmdline(exe, args);
    std::vector<wchar_t> buf(wcmd.begin(), wcmd.end());
    buf.push_back(0);
    STARTUPINFOW si{}; si.cb = sizeof(si);
    PROCESS_INFORMATION pi{};
    if (!CreateProcessW(nullptr, buf.data(), nullptr, nullptr, FALSE,
                        0, nullptr, nullptr, &si, &pi)) {
        std::fprintf(stderr, "CreateProcess failed: %lu\n", GetLastError());
        return 0;
    }
    unsigned int pid = pi.dwProcessId;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return pid;
}

// Activate a UWP/MSIX app via IApplicationActivationManager. Returns the real
// process id that owns the app window. Requires an AUMID (PackageFullName!AppId).
inline unsigned int launch_uwp(const std::wstring& aumid,
                               const std::wstring& args_w) {
    IApplicationActivationManager* mgr = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_ApplicationActivationManager, nullptr,
                                  CLSCTX_INPROC_SERVER,
                                  IID_PPV_ARGS(&mgr));
    if (FAILED(hr) || !mgr) {
        std::fprintf(stderr, "CoCreateInstance(ActivationManager) failed: 0x%08lx\n", hr);
        return 0;
    }
    DWORD pid = 0;
    hr = mgr->ActivateApplication(aumid.c_str(),
                                  args_w.empty() ? nullptr : args_w.c_str(),
                                  AO_NONE, &pid);
    mgr->Release();
    if (FAILED(hr)) {
        std::fprintf(stderr, "ActivateApplication failed: 0x%08lx (aumid=%ls)\n", hr, aumid.c_str());
        return 0;
    }
    return pid;
}

// Resolve a .lnk shortcut to its target exe path and arguments. Returns true
// and fills out_path/out_args on success. Uses the shell IShellLinkW COM iface.
// Callers should pass the resolved path as the launch target so process-name
// matching works against the real exe.
inline bool resolve_lnk(const std::wstring& lnk_path,
                        std::wstring& out_path, std::wstring& out_args) {
    IShellLinkW* sl = nullptr;
    IPersistFile* pf = nullptr;
    bool ok = false;
    HRESULT hr = CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_PPV_ARGS(&sl));
    if (FAILED(hr) || !sl) return false;
    hr = sl->QueryInterface(IID_PPV_ARGS(&pf));
    if (FAILED(hr) || !pf) { sl->Release(); return false; }
    hr = pf->Load(lnk_path.c_str(), STGM_READ);
    if (SUCCEEDED(hr)) {
        // Resolve with no UI window, no inheritance of the shortcut's env.
        hr = sl->Resolve(nullptr, SLR_NO_UI | SLR_NOUPDATE);
        if (SUCCEEDED(hr)) {
            wchar_t target[MAX_PATH] = {};
            WIN32_FIND_DATAW fd{};
            hr = sl->GetPath(target, MAX_PATH, &fd, 0);
            if (SUCCEEDED(hr) && target[0]) {
                out_path = target;
                wchar_t args[1024] = {};
                if (SUCCEEDED(sl->GetArguments(args, 1024)) && args[0]) {
                    out_args = args;
                }
                ok = true;
            }
        }
    }
    pf->Release();
    sl->Release();
    return ok;
}

// If target_exe is a .lnk shortcut, resolve it in place (mutating o.target_exe
// and appending shortcut arguments). Called once before any launch.
inline void maybe_resolve_shortcut(Options& o) {
    std::string lower = lowered(o.target_exe);
    if (lower.size() < 4 || lower.compare(lower.size() - 4, 4, ".lnk") != 0) return;

    auto to_a = [](const std::wstring& w) {
        int n = WideCharToMultiByte(CP_ACP, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
        std::string s(n, 0);
        WideCharToMultiByte(CP_ACP, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr);
        return s;
    };

    std::wstring wpath, wargs;
    if (resolve_lnk(to_wide(o.target_exe), wpath, wargs)) {
        std::string resolved = to_a(wpath);
        if (!resolved.empty()) {
            o.target_exe = resolved;
            // Prepend shortcut arguments before any user-supplied args.
            if (!wargs.empty()) {
                std::string a = to_a(wargs);
                // Split on whitespace (simple; shortcut args rarely quote).
                std::vector<std::string> parts;
                size_t i = 0;
                while (i < a.size()) {
                    while (i < a.size() && isspace((unsigned char)a[i])) ++i;
                    if (i >= a.size()) break;
                    std::string tok;
                    while (i < a.size() && !isspace((unsigned char)a[i])) tok += a[i++];
                    parts.push_back(tok);
                }
                std::vector<std::string> combined = parts;
                for (auto& u : o.target_args) combined.push_back(u);
                o.target_args = combined;
            }
            std::fprintf(stderr, "[lnk] resolved to: %s\n",
                         to_utf8(resolved).c_str());
        }
    } else {
        std::fprintf(stderr, "[lnk] could not resolve shortcut: %s\n",
                     to_utf8(o.target_exe).c_str());
    }
}

// Decide launch strategy. --uwp goes through the activation manager;
// everything else (including a document's default handler, substituted by the
// caller) is a plain exe via CreateProcess.
inline LaunchResult launch_target(const Options& o) {
    LaunchResult r;

    // If the user supplied an AUMID via --uwp, go through the activation
    // manager; on failure fall through to CreateProcess.
    if (!o.aumid.empty()) {
        std::wstring args_w;
        for (size_t i = 0; i < o.target_args.size(); ++i) {
            if (i) args_w += L" ";
            args_w += to_wide(o.target_args[i]);
        }
        unsigned int pid = launch_uwp(to_wide(o.aumid), args_w);
        if (pid != 0) {
            r.pid = pid;
            r.kind = LaunchKind::kActivateApp;
            return r;
        }
    }

    // Document mode is handled by the caller (association resolution +
    // direct CreateProcess); by this point target_exe is always runnable.
    r.pid = launch_createprocess(o.target_exe, o.target_args);
    return r;
}

// Teardown: close the measured app the way a user would (WM_CLOSE to every
// top-level window), give it a grace window to exit cleanly, ask message-pump
// threads to quit (WM_QUIT), and only force TerminateProcess on survivors.
// A hard kill makes many apps (Adobe suite, Office) show "previous session
// did not exit cleanly" / safe-mode prompts on next launch; a clean shutdown
// path lets them save state properly.
//
// Phase 1 (graceful): every 500ms, WM_CLOSE every top-level window owned by
//   a tree pid. Re-posting matters: dialog-heavy flows reveal a NEW window
//   as each closes (e.g. Office's safe-mode prompt followed by the start
//   screen), and a single posting round stalls on the first dialog.
// Phase 2 (quit): WM_QUIT to every thread of surviving killable pids -
//   windowless background instances exit via their message pump, which a
//   window-targeted WM_CLOSE can never reach.
// Phase 3 (force): TerminateProcess whatever is still alive.
//
// Safety: processes that pre-existed the measurement are never force-killed.
// Two flavors of "pre-existed":
//   - recorded by ETW with start_qpc < T0 (a reused instance the registry saw)
//   - adopted from a live-process scan, hence absent from the registry
// Both still receive WM_CLOSE (closing the window the measurement opened is
// the desired outcome) but survive phase 3. Only processes we started this
// run - the launched pid and registry-recorded post-T0 processes - may be
// terminated.
namespace detail {

struct CloseCtx {
    const unsigned int* pids;
    size_t              n;
    size_t              posted = 0;
};

inline BOOL CALLBACK post_close_enum(HWND hwnd, LPARAM lp) {
    auto* ctx = reinterpret_cast<CloseCtx*>(lp);
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    for (size_t i = 0; i < ctx->n; ++i) {
        if (ctx->pids[i] == pid) {
            // WM_CLOSE == user clicking X: the app runs its normal shutdown
            // (save prefs, release licenses, clean temp files).
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
            ctx->posted++;
            break;
        }
    }
    return TRUE;  // keep enumerating
}

// Ask every thread of a process to leave its message loop. Reaches the
// windowless background instances that WM_CLOSE cannot.
inline void post_wm_quit(unsigned int pid) {
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
    if (snap == INVALID_HANDLE_VALUE) return;
    THREADENTRY32 te{};
    te.dwSize = sizeof(te);
    if (Thread32First(snap, &te)) {
        do {
            if (te.th32OwnerProcessID == pid) {
                PostThreadMessageW(te.th32ThreadID, WM_QUIT, 0, 0);
            }
        } while (Thread32Next(snap, &te));
    }
    CloseHandle(snap);
}

} // namespace detail

inline void terminate_tree(unsigned int root_pid, PidTracker& tracker,
                    ProcessRegistry& reg, long long t0_qpc, bool debug) {
    // Collect candidates: the tracked tree plus the launched pid. Pre-existing
    // processes are close-only; only this run's processes are killable.
    unsigned int pids[PidTracker::kCapacity];
    size_t n = tracker.snapshot(pids, PidTracker::kCapacity);
    bool has_root = false;
    for (size_t i = 0; i < n; ++i) if (pids[i] == root_pid) { has_root = true; break; }
    if (!has_root && root_pid != 0 && n < PidTracker::kCapacity) pids[n++] = root_pid;

    HANDLE handles[PidTracker::kCapacity];
    bool   killable[PidTracker::kCapacity];
    size_t alive = 0;
    const unsigned int self = GetCurrentProcessId();
    for (size_t i = 0; i < n; ++i) {
        unsigned int pid = pids[i];
        if (pid == 0 || pid == self) continue;
        ProcessInfo info;
        bool recorded = reg.lookup(pid, info);
        bool pre_existing = recorded && info.start_qpc != 0 && info.start_qpc < t0_qpc;
        if (pre_existing) continue;  // recorded pre-existing instance: skip entirely
        // Killable: the pid we launched, or any registry-recorded process
        // (ETW saw it start during this run). A tracked pid with NO registry
        // entry was adopted from a live scan of pre-existing instances - its
        // windows may be closed, but the process itself is the user's.
        bool can_kill = (pid == root_pid) || recorded;
        HANDLE h = OpenProcess(SYNCHRONIZE | PROCESS_TERMINATE, FALSE, pid);
        if (!h) continue;
        if (WaitForSingleObject(h, 0) == WAIT_OBJECT_0) { CloseHandle(h); continue; }
        pids[alive]     = pid;   // compact the array to the live set
        killable[alive] = can_kill;
        handles[alive]  = h;
        alive++;
    }
    if (alive == 0) return;

    // Phases 1-2 (graceful): re-post WM_CLOSE every 500ms while waiting for a
    // clean exit (dialog flows reveal new windows as each closes). Bails out
    // as soon as everything is gone; gives up after kGracefulCloseMs total.
    const DWORD slice = 500;
    for (DWORD total = 0; total < config::kGracefulCloseMs; total += slice) {
        detail::CloseCtx ctx{pids, alive, 0};
        EnumWindows(detail::post_close_enum, reinterpret_cast<LPARAM>(&ctx));
        bool any_alive = false;
        for (size_t i = 0; i < alive; ++i) {
            if (WaitForSingleObject(handles[i], slice) != WAIT_OBJECT_0) any_alive = true;
        }
        if (!any_alive) break;  // everything exited cleanly
    }

    // Phase 2.5 (quit): WM_QUIT every thread of surviving killable pids -
    // windowless background instances exit via their message pump. A hard
    // kill here is what makes Office show "did not exit cleanly" prompts.
    bool any_for_quit = false;
    for (size_t i = 0; i < alive; ++i) {
        if (killable[i] &&
            WaitForSingleObject(handles[i], 0) != WAIT_OBJECT_0) {
            detail::post_wm_quit(pids[i]);
            any_for_quit = true;
        }
    }
    if (any_for_quit) {
        for (DWORD waited = 0; waited < 2000; waited += 200) {
            bool any_alive = false;
            for (size_t i = 0; i < alive; ++i) {
                if (WaitForSingleObject(handles[i], 200) != WAIT_OBJECT_0) any_alive = true;
            }
            if (!any_alive) break;
        }
    }

    // Phase 3: force-kill survivors - but only this run's processes. Close-only
    // survivors (a reused instance that ignored WM_CLOSE on some hidden
    // window) are deliberately left running.
    size_t closed = 0, forced = 0, spared = 0;
    for (size_t i = 0; i < alive; ++i) {
        if (WaitForSingleObject(handles[i], 0) == WAIT_OBJECT_0) {
            closed++;
        } else if (killable[i] && TerminateProcess(handles[i], 0)) {
            WaitForSingleObject(handles[i], 2000);
            forced++;
        } else {
            spared++;  // pre-existing survivor: not ours to kill
        }
        CloseHandle(handles[i]);
    }

    if (debug && (closed || forced || spared)) {
        std::fprintf(stderr,
            "[teardown] graceful=%d (WM_CLOSE/WM_QUIT), forced=%d, spared=%d\n",
            (int)closed, (int)forced, (int)spared);
    }
}

} // namespace st
