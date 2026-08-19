// PidTracker.hpp - Real-time process-tree tracker with orphan adoption.
//
// Built incrementally from ETW Process/Start events as they arrive. Two rules
// grow the tree:
//   1. Normal parent chain: a new pid whose parent is already in the tree is
//      added (covers Electron/Chromium multi-process, Java launcher->app, etc.).
//   2. Orphan adoption: a new pid whose parent is NOT in the tree, but whose
//      image name matches the target and which started at/after T0, is adopted
//      as a sub-root. This repairs broken parent links caused by indirect
//      launches (e.g. JianyingPro's stub that spawns the real exe via RPC, so
//      the real exe's ppid is an external service, not the stub).
//
// Once in the tree, a pid stays even if the process exits - Present/Window
// events may reference it after exit.
//
// Concurrency: written from the Timeline consumer thread (single writer) and
// the orchestrator (set_root, once). Read from DxgKrnl/WinEvent callbacks
// (contains, hot path). Slots use sequence counters so readers never see a
// torn write.
#pragma once
#include <windows.h>
#include <atomic>
#include <cstring>
#include <cstddef>
#include <cctype>
#include "Config.hpp"

namespace st {

class PidTracker {
public:
    // Backed by the centralized tunables in st::config.
    static constexpr size_t kCapacity = config::kPidTrackerCapacity;
    static constexpr size_t kNameLen  = config::kPidNameLen;

    // Metadata stored per tracked pid.
    struct Entry {
        unsigned int pid        = 0;
        unsigned int parent_pid = 0;
        long long    start_qpc  = 0;
        char         name[kNameLen] = {};
    };

    // Called once by the orchestrator right after launch. We do NOT seed
    // start_qpc here (T0 is only approximate); the real value comes from the
    // ETW Process/Start event when it arrives. earliest_start() falls back to
    // T0 if the root's ETW event never arrived.
    void set_root(unsigned int pid, long long t0_qpc) {
        root_.store(pid, std::memory_order_release);
        t0_for_root_ = t0_qpc;
        add(pid, 0, nullptr, 0);
    }

    void set_t0(long long qpc) { t0_.store(qpc, std::memory_order_release); }
    void set_target(const char* lowercased_name) {
        if (!lowercased_name) { target_name_[0] = 0; return; }
        std::strncpy(target_name_, lowercased_name, kNameLen - 1);
        target_name_[kNameLen - 1] = 0;
    }

    unsigned int root() const { return root_.load(std::memory_order_acquire); }

    // Add a pid whose parent is already known to be in the tree (normal chain).
    void add(unsigned int pid, unsigned int parent_pid,
             const char* name, long long start_qpc) {
        if (pid == 0) return;
        write_slot(pid, parent_pid, name, start_qpc);
    }

    // Decide whether a newly-seen process should join the tree, and add it if
    // so. Returns true if it belongs to the tree (already tracked, added via
    // parent chain, or adopted as an orphan).
    // Called from the Timeline consumer for every Process/Start event.
    bool consider(unsigned int pid, unsigned int parent_pid,
                  const char* name, long long start_qpc) {
        if (pid == 0) return false;
        if (contains(pid)) {
            // Already tracked (e.g. the root, seeded by set_root with the
            // approximate T0). Still refresh its metadata: write_slot's update
            // path fills in the precise ETW start_qpc and image name, which
            // earliest_start() needs for an accurate T1.
            add(pid, parent_pid, name, start_qpc);
            return true;
        }
        if (parent_pid != 0 && contains(parent_pid)) {
            add(pid, parent_pid, name, start_qpc);
            return true;
        }
        // Orphan adoption: name matches target and started at/after T0.
        if (name && name[0] && target_name_[0] &&
            std::strcmp(name, target_name_) == 0) {
            long long t0 = t0_.load(std::memory_order_acquire);
            if (t0 == 0 || start_qpc == 0 || start_qpc >= t0) {
                add(pid, parent_pid, name, start_qpc);
                adopted_one_ = true;
                return true;
            }
        }
        return false;
    }

    bool adopted_any() const { return adopted_one_; }

    // Reuse-scenario adoption: claim a pre-existing process (start_qpc < T0)
    // whose name matches the target. Triggered by the orchestrator when the
    // launched pid exits quickly without spawning tracked children - a sign
    // the app reused an already-running instance (Edge/Word/Chrome with an
    // existing window). The pre-existing process and its descendants then
    // behave like an adopted sub-root for Present/Window correlation.
    // Returns true if a process was adopted.
    bool adopt_existing(unsigned int pid, const char* name, long long start_qpc) {
        if (pid == 0 || contains(pid)) return false;
        if (!name || !name[0] || !target_name_[0]) return false;
        if (std::strcmp(name, target_name_) != 0) return false;
        write_slot(pid, 0, name, start_qpc);
        adopted_one_ = true;
        reuse_adopted_ = true;
        return true;
    }

    bool reuse_adopted() const { return reuse_adopted_; }

    // Install-root orphan adoption: claim a post-T0 process whose image lives
    // under the target's install directory. Launcher stubs and their real app
    // share the install root, often with a DIFFERENT exe name in a versioned
    // subdirectory and a parent link that goes through an external broker
    // (e.g. Soda Music: SodaMusicLauncher.exe spawns 3.5.1\SodaMusic.exe whose
    // ppid is outside the tree). The caller (Timeline) performs the path check;
    // the tracker only records the adoption. Such pids are killable at
    // teardown (they started during this run).
    bool adopt_dir_orphan(unsigned int pid, unsigned int parent_pid,
                          const char* name, long long start_qpc) {
        if (pid == 0 || contains(pid)) return false;
        add(pid, parent_pid, name, start_qpc);
        adopted_one_ = true;
        return true;
    }

    // Hot-path query from DxgKrnl/WinEvent callbacks. Linear scan, no locks.
    bool contains(unsigned int pid) const {
        if (pid == 0) return false;
        for (size_t i = 0; i < kCapacity; ++i) {
            const Slot& s = slots_[i];
            uint32_t seq1 = s.seq.load(std::memory_order_acquire);
            if (seq1 & 1) { ++i; continue; }   // writer in progress, skip
            unsigned int cur = s.data.pid;
            uint32_t seq2 = s.seq.load(std::memory_order_acquire);
            if (seq1 != seq2) continue;
            if (cur == 0) return false;         // sentinel: rest empty
            if (cur == pid) return true;
        }
        return false;
    }

    // Find the earliest start among tracked pids matching `name` (or any if
    // name is null). Used to derive T1 (earliest relevant Process/Start).
    // If the root's ETW Process/Start event never arrived (start_qpc==0), fall
    // back to the T0 stamp captured at set_root time so T1 is still usable.
    long long earliest_start(const char* name = nullptr) const {
        long long best = 0;
        unsigned int r = root_.load(std::memory_order_acquire);
        for (size_t i = 0; i < kCapacity; ++i) {
            const Slot& s = slots_[i];
            uint32_t seq1 = s.seq.load(std::memory_order_acquire);
            if (seq1 & 1) continue;
            Entry snap = s.data;
            uint32_t seq2 = s.seq.load(std::memory_order_acquire);
            if (seq1 != seq2 || snap.pid == 0) continue;
            if (name && name[0] && std::strcmp(snap.name, name) != 0) continue;
            long long q = snap.start_qpc;
            if (q == 0 && snap.pid == r) q = t0_for_root_;  // root ETW miss
            if (q != 0 && (best == 0 || q < best)) best = q;
        }
        return best;
    }

    size_t count() const {
        size_t n = 0;
        for (size_t i = 0; i < kCapacity; ++i)
            if (slots_[i].data.pid != 0) ++n;
        return n;
    }

    size_t snapshot(unsigned int* out, size_t max_out) const {
        size_t n = 0;
        for (size_t i = 0; i < kCapacity && n < max_out; ++i) {
            unsigned int cur = slots_[i].data.pid;
            if (cur == 0) continue;
            out[n++] = cur;
        }
        return n;
    }

private:
    struct Slot {
        std::atomic<uint32_t> seq{0};   // even=stable, odd=writing
        Entry data{};
    };

    void write_slot(unsigned int pid, unsigned int parent_pid,
                    const char* name, long long start_qpc) {
        // Linear probe for an existing entry for this pid, or the first empty slot.
        for (size_t i = 0; i < kCapacity; ++i) {
            Slot& s = slots_[i];
            uint32_t seq = s.seq.load(std::memory_order_acquire);
            if ((seq & 1) == 0 && s.data.pid == pid) {
                // Already tracked. Update start_qpc/name if we have better info
                // (the real ETW Process/Start qpc refines the approximate T0 we
                // seeded in set_root).
                if (start_qpc && (s.data.start_qpc == 0 || s.data.name[0] == 0)) {
                    uint32_t expected = seq;
                    if (s.seq.compare_exchange_strong(
                            expected, seq + 1, std::memory_order_acquire,
                            std::memory_order_relaxed)) {
                        if (start_qpc) s.data.start_qpc = start_qpc;
                        if (name && name[0] && s.data.name[0] == 0) {
                            std::strncpy(s.data.name, name, kNameLen - 1);
                            s.data.name[kNameLen - 1] = 0;
                        }
                        s.seq.store(seq + 2, std::memory_order_release);
                    }
                }
                return;
            }
            if ((seq & 1) == 0 && s.data.pid == 0) {
                // Claim this slot.
                uint32_t expected = seq;
                if (!s.seq.compare_exchange_strong(
                        expected, seq + 1, std::memory_order_acquire,
                        std::memory_order_relaxed)) {
                    continue;  // lost race; try next
                }
                s.data.pid        = pid;
                s.data.parent_pid = parent_pid;
                s.data.start_qpc  = start_qpc;
                if (name) {
                    std::strncpy(s.data.name, name, kNameLen - 1);
                    s.data.name[kNameLen - 1] = 0;
                } else {
                    s.data.name[0] = 0;
                }
                s.seq.store(seq + 2, std::memory_order_release);
                return;
            }
        }
        // Table full - ignore. kPidTrackerCapacity is ample.
    }

    Slot                 slots_[kCapacity];
    std::atomic<unsigned int> root_{0};
    std::atomic<long long>    t0_{0};
    long long                t0_for_root_ = 0;  // fallback for root's start_qpc
    char                 target_name_[kNameLen] = {};
    bool                 adopted_one_   = false;
    bool                 reuse_adopted_ = false;
};

} // namespace st
