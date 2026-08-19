// ProcessRegistry.hpp - Global process-name registry keyed by pid.
//
// Purpose: correlate window events back to a process name WITHOUT relying on
// a process tree. The NT Kernel Logger feeds every Process/Start event here;
// anyone (Timeline, WinEvent fallback) can look up a pid's image name.
//
// Writer: KernelSession's ETW consumer thread (record()). Caller thread for
//         the manual OpenProcess+QueryFullProcessImageName fallback.
// Readers: Timeline consumer thread (lookup()), single-threaded.
//
// Concurrency: record() is called from the ETW consumer thread; lookup() from
// the Timeline consumer thread. We keep each slot self-contained and use a
// sequence counter (seq) per slot so a reader either sees a complete old
// entry or a complete new one - never a torn write. This avoids locks on the
// hot ETW path.
#pragma once
#include <windows.h>
#include <atomic>
#include <cstring>
#include <cstddef>
#include "Config.hpp"

namespace st {

struct ProcessInfo {
    unsigned int pid = 0;
    unsigned int parent_pid = 0;
    long long   start_qpc = 0;
    // Lowercased image basename (e.g. "notepad.exe"), UTF-8. Empty if unknown.
    char image_name[config::kRegistryNameLen] = {};
};

class ProcessRegistry {
public:
    static constexpr size_t kCapacity = config::kRegistryCapacity; // slots

    // Record (or update) a pid's metadata. Called from ETW consumer thread.
    // image_name is a lowercased basename; pass nullptr if unavailable.
    void record(unsigned int pid, unsigned int parent_pid, long long start_qpc,
                const char* image_name) {
        if (pid == 0) return;
        size_t idx = slot_for(pid);
        Slot& s = slots_[idx];
        // Bump sequence (odd = writing) so readers retry on a concurrent update.
        uint32_t w0 = s.seq.load(std::memory_order_acquire);
        s.seq.store(w0 + 1, std::memory_order_release);   // odd => write in progress
        s.data.pid        = pid;
        s.data.parent_pid = parent_pid;
        s.data.start_qpc  = start_qpc;
        if (image_name) {
            std::strncpy(s.data.image_name, image_name, sizeof(s.data.image_name) - 1);
            s.data.image_name[sizeof(s.data.image_name) - 1] = 0;
        } else {
            s.data.image_name[0] = 0;
        }
        s.seq.store(w0 + 2, std::memory_order_release);   // even => stable again
    }

    // Look up a pid. Returns false if not present. Called from consumer thread.
    // Copies out under sequence guard so it never sees a torn write.
    bool lookup(unsigned int pid, ProcessInfo& out) const {
        if (pid == 0) return false;
        size_t idx = (pid * kHashStep) & (kCapacity - 1);
        const Slot& s = slots_[idx];
        uint32_t seq1 = s.seq.load(std::memory_order_acquire);
        if (seq1 & 1) return false;            // writer in progress
        ProcessInfo snap = s.data;
        uint32_t seq2 = s.seq.load(std::memory_order_acquire);
        if (seq1 != seq2) return false;        // changed under us
        if (snap.pid != pid) return false;     // slot reused by another pid
        out = snap;
        return true;
    }

    // Number of recorded entries (approximate, for diagnostics).
    size_t count() const {
        size_t n = 0;
        for (size_t i = 0; i < kCapacity; ++i) {
            if (slots_[i].data.pid != 0) ++n;
        }
        return n;
    }

    // Visit every recorded entry. Called from the consumer thread (not the
    // hot ETW path). Returns false to stop iteration early.
    template <class Visitor>
    void for_each(Visitor&& v) const {
        for (size_t i = 0; i < kCapacity; ++i) {
            const Slot& s = slots_[i];
            uint32_t seq1 = s.seq.load(std::memory_order_acquire);
            if (seq1 & 1) continue;
            ProcessInfo snap = s.data;
            uint32_t seq2 = s.seq.load(std::memory_order_acquire);
            if (seq1 != seq2 || snap.pid == 0) continue;
            if (!v(snap)) break;
        }
    }

private:
    static constexpr size_t kHashStep = 2654435761u; // Knuth multiplicative

    size_t slot_for(unsigned int pid) const {
        return (pid * kHashStep) & (kCapacity - 1);
    }

    struct Slot {
        std::atomic<uint32_t> seq{0};   // even = stable, odd = writing
        ProcessInfo data{};
    };

    mutable Slot slots_[kCapacity];
};

} // namespace st
