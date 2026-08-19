// Config.hpp - Centralized tunables for AppTrace.
//
// Collects magic numbers that were previously scattered across modules so they
// can be reviewed/adjusted in one place. Values are constexpr so they compile
// to constants with zero runtime overhead.
#pragma once
#include <cstddef>

namespace st {
namespace config {

    // EventQueue ring-buffer capacity (must be a power of two). The general
    // queue carries low-rate window/process events; 2048 comfortably holds a
    // startup burst without dropping.
    constexpr size_t kQueueCapacity = 2048;

    // Dedicated EventQueue instance for DxgKrnl PresentHistory events.
    // Presents are the only high-rate ETW stream (every app on the system plus
    // DWM commits frames continuously), so they get their own ring: a burst
    // there can only evict presents, never window/process events on the
    // general queue. 4096 gives seconds of headroom even under load.
    constexpr size_t kPresentQueueCapacity = 4096;

    // PidTracker: max processes in the launch tree (root + descendants +
    // adopted orphans). 512 is ample for any realistic app.
    constexpr size_t kPidTrackerCapacity = 512;
    constexpr size_t kPidNameLen         = 32;

    // ProcessRegistry: max distinct pids recorded globally (all system
    // Process/Start events during the capture window).
    constexpr size_t kRegistryCapacity = 4096;
    constexpr size_t kRegistryNameLen  = 64;

    // Timeline: bounded ring of cached PresentHistory events, re-checked
    // whenever the process tree grows (revisit_presents). A GPU child can
    // present before its Process/Start event has grown the tree (cold-start
    // ordering). DWM alone can flood ~25k presents/s on a composited desktop,
    // so the ring must hold ~1s of system-wide presents or the few events we
    // actually care about get evicted before the tree catches up - 16384
    // entries (~1MB, heap-allocated inside Timeline).
    constexpr size_t kPresentCache = 16384;

    // Timeline: bounded ring of cached WINDOW events (create/show/foreground)
    // whose pid was not yet in the tree when they arrived. Re-checked on every
    // tree growth exactly like presents. Covers reuse scenarios where the
    // window appears before instance adoption completes (e.g. Edge's
    // startup-boost instance showing a window within ~200ms of launch, while
    // reuse adoption is still in its settle delay). Window events are rare
    // compared to presents, so a small ring suffices.
    constexpr size_t kWindowCache = 256;

    // ETW session buffer sizing (BufferSize is in KB). unsigned long == ULONG,
    // used directly so this header does not need to pull in windows.h.
    constexpr unsigned long kEtwBufferSizeKb = 32;
    constexpr unsigned long kEtwMinBuffers    = 8;
    constexpr unsigned long kEtwMaxBuffers    = 16;

    // Default CLI values.
    constexpr int kDefaultTimeoutSec = 30;
    constexpr int kDefaultGraceSec   = 3;

    // Target teardown: first close gracefully (WM_CLOSE to every top-level
    // window, same as the user clicking X) and wait this long for a clean
    // exit. Apps force-killed via TerminateProcess show "did not exit
    // cleanly" warnings on next launch (e.g. Adobe), so grace matters.
    constexpr DWORD kGracefulCloseMs = 5000;

} // namespace config
} // namespace st
