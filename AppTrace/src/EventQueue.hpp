// EventQueue.hpp - Multi-producer single-consumer ring buffer.
//
// The general queue's producers are the ETW kernel consumer thread and the
// WinEvent hook thread. DxgKrnl PresentHistory events use a SEPARATE
// EventQueue instance (config::kPresentQueueCapacity): they are the only
// high-rate stream, and flooding there must never evict window/process
// events. The consumer is a single thread (the orchestrator's drain loop),
// draining the general queue first, then the present queue.
//
// push() is guarded by a spinlock (std::atomic_flag) so concurrent producers
// can't corrupt head_/slots. pop() is lock-free (single consumer). On overflow
// the oldest unconsumed entry is dropped and drop_count incremented - this is
// safe because the consumer only advances tail_ and the producer only bumps it
// past itself under the lock.
#pragma once
#include <windows.h>
#include <atomic>
#include <cstddef>
#include "Config.hpp"

namespace st {

// A single timestamped anchor event emitted by any source.
// Keep it small - this is copied on every push.
struct Event {
    enum Kind : unsigned char {
        kInvalid = 0,
        kProcessStart,      // ETW Process/Start        -> builds process tree
        kWindowCreate,      // WinEvent CREATE          -> window candidate
        kWindowShow,        // WinEvent SHOW            -> window candidate
        kWindowForeground,  // WinEvent FOREGROUND      -> window candidate
        kWindowDestroy,     // WinEvent DESTROY         -> marks window dead
        kFirstPresent,      // DxgKrnl PresentHistory   -> T4
    };

    Kind         kind = kInvalid;
    unsigned int pid = 0;          // process owning the window/event
    unsigned int parent_pid = 0;   // parent pid (ProcessStart only)
    long long    qpc = 0;          // QPC timestamp
    long long    aux  = 0;         // hwnd (WinEvent) or event_id (Present)
    char         name[config::kPidNameLen] = {};    // lowercased image basename (ProcessStart)
};

class alignas(64) EventQueue {
public:
    explicit EventQueue(size_t capacity_pow2 = config::kQueueCapacity)
        : mask_(capacity_pow2 - 1),
          buf_(new Event[capacity_pow2]) {
        // capacity must be a power of two for the mask trick.
    }

    ~EventQueue() { delete[] buf_; }

    EventQueue(const EventQueue&) = delete;
    EventQueue& operator=(const EventQueue&) = delete;

    // Producer side (multi-producer safe via spinlock). The lock is held only
    // for the slot write + head advance - a handful of cycles, not a syscall.
    void push(const Event& e) {
        // Acquire the spinlock: spin until we flip the flag from false to true.
        while (lock_.test_and_set(std::memory_order_acquire)) {
            // Backoff: yield to the OS scheduler briefly on contention. push is
            // not on the hottest path (Process/Start events are low-rate;
            // DxgKrnl Present is the only high-rate pusher and it's alone).
            YieldProcessor();
        }
        size_t h = head_.load(std::memory_order_relaxed);
        size_t t = tail_.load(std::memory_order_acquire);
        size_t next = h + 1;
        if ((next & mask_) == (t & mask_)) {
            // Full: drop oldest by advancing tail.
            drops_.fetch_add(1, std::memory_order_relaxed);
            tail_.store(t + 1, std::memory_order_relaxed);
        }
        buf_[h & mask_] = e;
        head_.store(next, std::memory_order_release);
        lock_.clear(std::memory_order_release);
    }

    // Consumer side (single consumer, lock-free).
    bool pop(Event& out) {
        size_t t = tail_.load(std::memory_order_relaxed);
        size_t h = head_.load(std::memory_order_acquire);
        if (t == h) return false;
        out = buf_[t & mask_];
        tail_.store(t + 1, std::memory_order_release);
        return true;
    }

    size_t drops() const { return drops_.load(std::memory_order_relaxed); }
    bool empty() const {
        return head_.load(std::memory_order_acquire) ==
               tail_.load(std::memory_order_acquire);
    }

private:
    const size_t mask_;
    Event* buf_;
    alignas(64) std::atomic<size_t> head_{0};
    alignas(64) std::atomic<size_t> tail_{0};
    std::atomic<size_t> drops_{0};
    alignas(64) std::atomic_flag lock_ = ATOMIC_FLAG_INIT;  // producer spinlock
};

} // namespace st
