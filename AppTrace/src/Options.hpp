// Options.hpp - Shared CLI option + result types for AppTrace.
//
// Centralizes the data structures that cross translation units: Launcher.hpp
// (launch strategies need Options) and Output.hpp (formatting needs Options +
// RunResult). Kept dependency-light so it can be included widely. The default
// timeout/grace values come from Config.hpp so there is a single source of
// truth for tunables.
#pragma once
#include "Config.hpp"

#include <string>
#include <vector>
#include <cstddef>

namespace st {

// Structured exit codes so callers (scripts/CI) can branch on the outcome
// rather than parsing stderr.
enum ExitCode {
    kExitOk            = 0,  // at least one run captured the first frame (T4)
    kExitPartial       = 4,  // runs completed but no T4 (T0-T3 valid; e.g. RDP)
    kExitNoCorrelation = 5,  // target process never matched (no window/pid)
    kExitUsage         = 2,  // bad CLI arguments
    kExitNotAdmin      = 3,  // not elevated
};

// Parsed command-line options. Populated by parse_args() in main.cpp.
struct Options {
    std::string output_file;    // JSONL path, optional
    std::string target_exe;
    std::string aumid;          // UWP app user model id (optional, for --uwp)
    std::string pname;          // override process-name key for window matching
    std::string batch_file;     // measure every app listed in this file (--batch)
    std::vector<std::string> target_args;
    bool        csv          = false;
    bool        cleanup_only = false;
    bool        debug        = false;
    bool        no_winevent  = false;
    bool        keep_alive   = false;  // don't terminate the target after capture
    int         timeout_sec  = config::kDefaultTimeoutSec;
    int         grace_sec    = config::kDefaultGraceSec;   // extra capture after the first frame
    int         runs         = 1;
    int         warmup       = 0;
};

// Result of a single measurement run. Consumed by Output.hpp.
//
// Naming scheme: durations measured FROM LAUNCH are "time_to_<milestone>_ms"
// (T0 -> X); durations BETWEEN milestones are "<from>_to_<to>_ms". The same
// names are used verbatim as JSON/CSV keys and documented in --help.
struct RunResult {
    // PRIMARY metric: launch -> the user sees the main window frame (T0->T3).
    // This is what product/UX cares about; the rest are diagnostic breakdowns.
    double time_to_window_ms       = 0.0; // T0->T3 (launch -> window shown)
    double time_to_first_frame_ms  = 0.0; // T0->T4 (launch -> first GPU frame;
                                          //      flip-model DirectX apps only)
    double time_to_process_ms      = 0.0; // T0->T1 (launch -> first TARGET
                                          //      process start; stub chains
                                          //      add forwarding time)
    double process_to_window_ms    = 0.0; // T1->T2 (process start -> window created)
    double window_to_frame_ms      = 0.0; // T2->T4 (window created -> first
                                          //      frame; 0 when T4 predates T2)
    unsigned int main_pid = 0;            // correlated process: first target-
                                          // named tree member, else launched pid
    long long first_frame_event_id = 0;   // ETW event id that marked the frame
    bool first_frame_seen = false;        // a first-frame (Present) was captured
    bool timed_out = false;               // watched for a frame, none arrived
    // Correlation diagnostics (included in JSONL output for analysis).
    bool   adopted       = false;  // orphan/reuse adoption occurred
    bool   reuse_adopted = false;  // specifically a reuse-scenario adoption
    size_t tracker_count = 0;      // processes in the tree
};

} // namespace st
