// Output.hpp - Result formatting (stdout JSON/CSV + JSONL file append).
//
// All presentation logic lives here so the orchestrator (main.cpp) stays about
// orchestration. Two surfaces:
//   - stdout: one compact line per run (JSON by default, CSV with --csv)
//   - JSONL file (--output): richer records carrying correlation diagnostics
// Plus the multi-run summary (median/mean/min/max) printed after the run loop.
//
// Field naming follows RunResult's scheme (time_to_* measured from launch,
// *_to_* for between-milestone segments); every key is documented in --help.
#pragma once
#include "Options.hpp"
#include "JsonWriter.hpp"
#include "QpcClock.hpp"

#include <cstdio>
#include <vector>
#include <algorithm>

namespace st {

// Emit one result to stdout (one-line JSON, or a CSV row) and, if --output was
// given, append a richer JSONL record (with correlation diagnostics) to the file.
inline void write_output(const Options& o, const RunResult& r, QpcClock& clock,
                         const char* target_label) {
    // stdout: one-line JSON or CSV.
    if (o.csv) {
        std::printf("%s,%u,%d,%.3f,%.3f,%.3f,%.3f,%.3f,%d,%lld\n",
            target_label, r.main_pid, r.first_frame_seen ? 1 : 0,
            r.time_to_first_frame_ms, r.time_to_window_ms, r.time_to_process_ms,
            r.process_to_window_ms, r.window_to_frame_ms,
            r.timed_out ? 1 : 0, r.first_frame_event_id);
    } else {
        JsonObject j;
        j.add("target",                target_label);
        j.add("main_pid",              (long long)r.main_pid);
        j.add("time_to_window_ms",     r.time_to_window_ms);
        j.add("first_frame_seen",      r.first_frame_seen);
        j.add("time_to_first_frame_ms", r.time_to_first_frame_ms);
        j.add("time_to_process_ms",    r.time_to_process_ms);
        j.add("process_to_window_ms",  r.process_to_window_ms);
        j.add("window_to_frame_ms",    r.window_to_frame_ms);
        j.add("first_frame_timeout",   r.timed_out);
        j.add("first_frame_event_id",  (long long)r.first_frame_event_id);
        std::printf("%s\n", j.str().c_str());
    }

    if (!o.output_file.empty()) {
        JsonObject j;
        j.add("target",                target_label);
        j.add("main_pid",              (long long)r.main_pid);
        j.add("time_to_window_ms",     r.time_to_window_ms);
        j.add("first_frame_seen",      r.first_frame_seen);
        j.add("time_to_first_frame_ms", r.time_to_first_frame_ms);
        j.add("time_to_process_ms",    r.time_to_process_ms);
        j.add("process_to_window_ms",  r.process_to_window_ms);
        j.add("window_to_frame_ms",    r.window_to_frame_ms);
        j.add("first_frame_timeout",   r.timed_out);
        j.add("first_frame_event_id",  (long long)r.first_frame_event_id);
        j.add("adopted",               r.adopted);
        j.add("reuse_adopted",         r.reuse_adopted);
        j.add("tracker_count",         (long long)r.tracker_count);
        j.add("qpc_freq",              clock.freq());
        FILE* f = nullptr;
        if (fopen_s(&f, o.output_file.c_str(), "a") == 0 && f) {
            std::fprintf(f, "%s\n", j.str().c_str());
            std::fclose(f);
        }
    }
}

// CSV column header, printed once before the run loop when --csv is set.
inline void print_csv_header() {
    std::printf("target,main_pid,first_frame_seen,time_to_first_frame_ms,"
                "time_to_window_ms,time_to_process_ms,process_to_window_ms,"
                "window_to_frame_ms,"
                "first_frame_timeout,first_frame_event_id\n");
}

// Multi-run summary: median/mean/min/max of the first-frame time over runs
// that saw one. Suppressed in CSV mode (raw rows are enough for scripts).
inline void print_summary(const std::vector<RunResult>& results, bool csv) {
    std::vector<double> frames;
    for (const auto& r : results) if (r.first_frame_seen) frames.push_back(r.time_to_first_frame_ms);
    if (frames.empty()) return;
    std::sort(frames.begin(), frames.end());
    double median = frames[frames.size() / 2];
    double sum = 0; for (double v : frames) sum += v;
    double mean = sum / frames.size();
    double mn = frames.front(), mx = frames.back();
    if (!csv) {
        std::printf("--- summary (%d runs) ---\n", (int)frames.size());
        std::printf("time_to_first_frame_ms  median=%.3f  mean=%.3f  min=%.3f  max=%.3f\n",
                    median, mean, mn, mx);
    }
}

} // namespace st
