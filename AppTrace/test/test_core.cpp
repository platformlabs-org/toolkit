// test_core.cpp - Unit tests for the lock-free core data structures.
//
// Tests EventQueue (MPSC safety), PidTracker (orphan adoption, contains),
// and ProcessRegistry (record/lookup). No external test framework - a tiny
// assert harness so there are zero dependencies to build/distribute.
//
// Build: cl /O2 /std:c++17 /EHsc /MT /D_CRT_SECURE_NO_WARNINGS /DNOMINMAX \
//          /DUNICODE /D_UNICODE /DSTARTUP_TIME_TEST \
//          test\test_core.cpp /Fe:test\test_core.exe \
//          /link /SUBSYSTEM:CONSOLE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cstring>
#include <thread>
#include <vector>
#include <atomic>
#include <random>

// The headers under test are normally consumed by main.cpp; pull them directly.
#include "../src/EventQueue.hpp"
#include "../src/PidTracker.hpp"
#include "../src/ProcessRegistry.hpp"
#include "../src/Timeline.hpp"
#include "../src/QpcClock.hpp"
#include "../src/Interactive.hpp"

using namespace st;

// ---------------------------------------------------------------------------
// Minimal test harness
// ---------------------------------------------------------------------------
static int g_tests_run = 0;
static int g_tests_failed = 0;

#define TEST(name) static void name()
#define RUN(name) do { \
    std::printf("  [run] %-50s ", #name); \
    g_tests_run++; \
    name(); \
    std::printf("OK\n"); \
} while (0)

#define CHECK(cond) do { \
    if (!(cond)) { \
        std::printf("FAIL\n  line %d: CHECK(%s) failed\n", __LINE__, #cond); \
        g_tests_failed++; \
        return; \
    } \
} while (0)

#define CHECK_EQ(a, b) do { \
    if ((a) != (b)) { \
        std::printf("FAIL\n  line %d: CHECK_EQ(%s, %s): %lld != %lld\n", \
                    __LINE__, #a, #b, (long long)(a), (long long)(b)); \
        g_tests_failed++; \
        return; \
    } \
} while (0)

// ===========================================================================
// EventQueue tests
// ===========================================================================

TEST(queue_basic_push_pop) {
    EventQueue q(16);
    Event e{}; e.kind = Event::kProcessStart; e.pid = 42; e.qpc = 100;
    q.push(e);

    Event out{};
    CHECK(q.pop(out));
    CHECK_EQ(out.pid, 42u);
    CHECK_EQ(out.qpc, 100ll);

    // Queue should now be empty.
    CHECK(!q.pop(out));
    CHECK(q.empty());
}

TEST(queue_fifo_order) {
    EventQueue q(64);
    for (unsigned i = 1; i <= 20; ++i) {
        Event e{}; e.pid = i;
        q.push(e);
    }
    for (unsigned i = 1; i <= 20; ++i) {
        Event out{};
        CHECK(q.pop(out));
        CHECK_EQ(out.pid, i);  // FIFO order preserved
    }
}

TEST(queue_overflow_drops_oldest) {
    EventQueue q(8);  // capacity 8 (mask 7)
    // Fill past capacity: pushes 0..15, capacity 8 means we keep the last 7.
    for (unsigned i = 0; i < 16; ++i) {
        Event e{}; e.pid = i;
        q.push(e);
    }
    CHECK(q.drops() > 0);  // some drops occurred
    // Drain whatever remains - should be the most recent entries, in order.
    unsigned prev = 0;
    int count = 0;
    Event out{};
    while (q.pop(out)) {
        if (count > 0) CHECK(out.pid > prev || out.pid == prev);  // monotonic-ish
        prev = out.pid;
        ++count;
    }
    CHECK(count > 0);
    CHECK(count <= 8);
}

TEST(queue_multiproducer_no_corruption) {
    // The critical test for B1: multiple threads push concurrently. After
    // draining, every pushed pid should appear exactly once (no lost/dup
    // events from unsynchronized head_ updates).
    EventQueue q(4096);
    constexpr int kProducers = 4;
    constexpr int kPerProducer = 500;

    std::vector<std::thread> producers;
    std::atomic<int> go{0};
    for (int t = 0; t < kProducers; ++t) {
        producers.emplace_back([&, t]() {
            while (go.load(std::memory_order_acquire) == 0) {}
            for (int i = 0; i < kPerProducer; ++i) {
                // Unique pid per (thread, item): thread*10000 + i.
                Event e{};
                e.kind = Event::kProcessStart;
                e.pid = static_cast<unsigned>(t * 10000 + i + 1);
                q.push(e);
            }
        });
    }
    go.store(1, std::memory_order_release);
    for (auto& th : producers) th.join();

    // Drain and verify uniqueness. Every pid should appear exactly once.
    std::vector<bool> seen(kProducers * 10000 + kPerProducer + 1, false);
    int popped = 0;
    Event out{};
    while (q.pop(out)) {
        CHECK(out.pid < seen.size());
        CHECK(!seen[out.pid]);  // no duplicates
        seen[out.pid] = true;
        ++popped;
    }
    int expected = kProducers * kPerProducer;
    int lost = (int)q.drops();
    CHECK_EQ(popped + lost, expected);
    std::printf("(popped=%d dropped=%d) ", popped, lost);
}

// ===========================================================================
// PidTracker tests
// ===========================================================================

TEST(tracker_set_root_and_contains) {
    PidTracker t;
    t.set_target("myapp.exe");
    t.set_t0(1000);
    t.set_root(100, 1000);

    CHECK(t.contains(100));
    CHECK(!t.contains(999));
    CHECK_EQ(t.root(), 100u);
}

TEST(tracker_parent_chain_adoption) {
    PidTracker t;
    t.set_target("app.exe");
    t.set_t0(1000);
    t.set_root(100, 1000);

    // 100 -> 200 (child of root)
    CHECK(t.consider(200, 100, "child.exe", 1100));
    CHECK(t.contains(200));

    // 200 -> 300 (grandchild)
    CHECK(t.consider(300, 200, "grandchild.exe", 1200));
    CHECK(t.contains(300));

    // Unrelated process (parent not in tree, name doesn't match)
    CHECK(!t.consider(999, 888, "other.exe", 1300));
    CHECK(!t.contains(999));
}

TEST(tracker_orphan_adoption_by_name) {
    // Simulates the JianyingPro scenario: real exe's parent is external, but
    // its name matches the target and it started after T0.
    PidTracker t;
    t.set_target("jianyingpro.exe");
    t.set_t0(5000);

    // Root is the stub (parent unknown, but we set it manually).
    t.set_root(100, 5000);

    // Real exe appears with an external parent (888 not in tree), but name
    // matches and start >= T0 -> orphan adoption.
    CHECK(t.consider(200, 888, "jianyingpro.exe", 5100));
    CHECK(t.contains(200));
    CHECK(t.adopted_any());

    // Now children of 200 should chain in.
    CHECK(t.consider(300, 200, "helper.exe", 5200));
    CHECK(t.contains(300));
}

TEST(tracker_orphan_rejected_before_t0) {
    // A same-named process that started BEFORE T0 should NOT be adopted (it's
    // a pre-existing instance, not part of this launch).
    PidTracker t;
    t.set_target("app.exe");
    t.set_t0(5000);

    CHECK(!t.consider(200, 888, "app.exe", 4000));  // before T0
    CHECK(!t.contains(200));
    CHECK(!t.adopted_any());
}

TEST(tracker_adopt_existing_reuse) {
    // The reuse path: explicitly adopt a pre-existing (start < T0) process.
    PidTracker t;
    t.set_target("chrome.exe");
    t.set_t0(5000);

    bool ok = t.adopt_existing(700, "chrome.exe", 3000);  // started before T0
    CHECK(ok);
    CHECK(t.contains(700));
    CHECK(t.adopted_any());
    CHECK(t.reuse_adopted());
}

TEST(tracker_earliest_start) {
    PidTracker t;
    t.set_target("app.exe");
    t.set_root(100, 1000);
    t.set_t0(1000);

    t.consider(200, 100, "child.exe", 800);   // earlier than root
    t.consider(300, 100, "app.exe", 1200);    // matches target name

    // earliest_start() for target name should find 300 (only app.exe match).
    long long es = t.earliest_start("app.exe");
    CHECK_EQ(es, 1200ll);
}

TEST(tracker_root_etw_refines_start_qpc) {
    // P1 regression: set_root seeds start_qpc=0 with a T0 fallback. When the
    // root's ETW Process/Start event arrives later (consider -> contains ->
    // add), it MUST overwrite the fallback so T1 reflects the precise kernel
    // timestamp instead of equalling T0.
    PidTracker t;
    t.set_target("app.exe");
    t.set_root(100, 5000);          // T0 = 5000 (fallback only)
    t.set_t0(5000);

    // ETW event for the root arrives: precise start = 5042 (> T0).
    bool ok = t.consider(100, 0, "app.exe", 5042);
    CHECK(ok);  // already tracked, but metadata refreshed

    long long es = t.earliest_start("app.exe");
    CHECK_EQ(es, 5042ll);  // NOT 5000 - the ETW value won
}

// ===========================================================================
// ProcessRegistry tests
// ===========================================================================

TEST(registry_record_and_lookup) {
    ProcessRegistry r;
    r.record(100, 50, 9999, "app.exe");

    ProcessInfo info{};
    CHECK(r.lookup(100, info));
    CHECK_EQ(info.pid, 100u);
    CHECK_EQ(info.parent_pid, 50u);
    CHECK_EQ(info.start_qpc, 9999ll);
    CHECK(std::strcmp(info.image_name, "app.exe") == 0);
}

TEST(registry_miss_on_unknown) {
    ProcessRegistry r;
    ProcessInfo info{};
    CHECK(!r.lookup(999, info));
}

TEST(registry_overwrite_on_same_pid) {
    ProcessRegistry r;
    r.record(100, 50, 1000, nullptr);     // no name initially
    r.record(100, 50, 1000, "app.exe");   // fill in name

    ProcessInfo info{};
    CHECK(r.lookup(100, info));
    CHECK(std::strcmp(info.image_name, "app.exe") == 0);
}

TEST(registry_concurrent_record_lookup) {
    // Writer thread records pids, reader thread looks them up concurrently.
    // With sequence-counter guards, the reader should never see a torn write.
    ProcessRegistry r;
    constexpr int N = 2000;

    std::thread writer([&]() {
        for (int i = 1; i <= N; ++i) {
            char name[32];
            std::snprintf(name, sizeof(name), "proc_%d.exe", i);
            r.record(static_cast<unsigned>(i), 0, i * 10, name);
        }
    });

    std::atomic<bool> stop{false};
    int torn_count = 0;
    std::thread reader([&]() {
        while (!stop.load(std::memory_order_acquire)) {
            for (int i = 1; i <= N; ++i) {
                ProcessInfo info{};
                if (r.lookup(static_cast<unsigned>(i), info)) {
                    // If we got a hit, pid must match and name must be intact.
                    if (info.pid != static_cast<unsigned>(i)) ++torn_count;
                }
            }
        }
    });

    writer.join();
    stop.store(true, std::memory_order_release);
    reader.join();

    CHECK_EQ(torn_count, 0);
    std::printf("(no torn reads) ");
}

// ===========================================================================
// Timeline window-lifetime tests
// ===========================================================================

// Helper: push events into a queue, then drain them into a Timeline via
// drain_one. Deadlines are 0 (disabled) so not_finished never cuts short.
static void feed_events(Timeline& tl, EventQueue& q, const std::vector<Event>& events) {
    EventQueue pq(16);  // empty present queue (these tests carry no presents)
    for (const auto& e : events) q.push(e);
    long long d = 0;
    for (size_t i = 0; i < events.size(); ++i) {
        if (!tl.drain_one(q, pq, d, d)) break;
    }
}

TEST(timeline_single_window_selected) {
    // A single window: CREATE then SHOW. finalize should pick it.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q;
    Event wc{}; wc.kind = Event::kWindowCreate; wc.pid = 100; wc.qpc = 2000; wc.aux = 0xAAA;
    Event ws{}; ws.kind = Event::kWindowShow;   ws.pid = 100; ws.qpc = 2100; ws.aux = 0xAAA;
    q.push(wc); q.push(ws);
    EventQueue pq(16);
    long long d = 0;
    tl.drain_one(q, pq, d, d); tl.drain_one(q, pq, d, d);
    tl.finalize_windows();

    CHECK_EQ(tl.anchors().t2, 2000ll);
    CHECK_EQ(tl.anchors().t3, 2100ll);
}

TEST(timeline_splash_excluded_by_destroy) {
    // Splash appears first, gets destroyed. Main window appears later and
    // survives. finalize should pick the main window, NOT the splash.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q;
    // splash: CREATE 1500, SHOW 1600, DESTROY 5000
    Event sc{}; sc.kind = Event::kWindowCreate;  sc.pid = 100; sc.qpc = 1500; sc.aux = 0xA1;
    Event ss{}; ss.kind = Event::kWindowShow;    ss.pid = 100; ss.qpc = 1600; ss.aux = 0xA1;
    Event sd{}; sd.kind = Event::kWindowDestroy; sd.pid = 100; sd.qpc = 5000; sd.aux = 0xA1;
    // main: CREATE 6000, SHOW 6100 (survives)
    Event mc{}; mc.kind = Event::kWindowCreate; mc.pid = 100; mc.qpc = 6000; mc.aux = 0xB1;
    Event ms{}; ms.kind = Event::kWindowShow;   ms.pid = 100; ms.qpc = 6100; ms.aux = 0xB1;
    q.push(sc); q.push(ss); q.push(sd); q.push(mc); q.push(ms);
    EventQueue pq(16);
    long long d = 0;
    for (int i = 0; i < 5; ++i) tl.drain_one(q, pq, d, d);
    tl.finalize_windows();

    // T2 should be main's CREATE (6000), not splash's (1500).
    CHECK_EQ(tl.anchors().t2, 6000ll);
    CHECK_EQ(tl.anchors().t3, 6100ll);
}

TEST(timeline_all_destroyed_picks_longest_lived) {
    // Edge case: all windows destroyed (app crashed). Pick the one that lived
    // longest as the best approximation.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q;
    // window A: CREATE 2000, DESTROY 2500 (lived 500)
    Event ac{}; ac.kind = Event::kWindowCreate;  ac.pid = 100; ac.qpc = 2000; ac.aux = 0xA1;
    Event ad{}; ad.kind = Event::kWindowDestroy; ad.pid = 100; ad.qpc = 2500; ad.aux = 0xA1;
    // window B: CREATE 3000, DESTROY 9000 (lived 6000 - longest)
    Event bc{}; bc.kind = Event::kWindowCreate;  bc.pid = 100; bc.qpc = 3000; bc.aux = 0xB1;
    Event bd{}; bd.kind = Event::kWindowDestroy; bd.pid = 100; bd.qpc = 9000; bd.aux = 0xB1;
    q.push(ac); q.push(ad); q.push(bc); q.push(bd);
    EventQueue pq(16);
    long long d = 0;
    for (int i = 0; i < 4; ++i) tl.drain_one(q, pq, d, d);
    tl.finalize_windows();

    // Should pick B (lived 6000 > 500).
    CHECK_EQ(tl.anchors().t2, 3000ll);
}

// ===========================================================================
// Timeline present-correlation tests
// ===========================================================================

TEST(timeline_present_cached_before_tree_growth) {
    // Regression for the DxgKrnl upstream-filter bug: a GPU child process can
    // present BEFORE its Process/Start event has grown the tree (cold-start
    // ordering). The present must be cached, then attributed once the tree
    // catches up - not dropped because it arrived "early".
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q(16);   // general: process/window events
    EventQueue pq(16);  // dedicated: presents
    // Unrelated present (pid 900 is never adopted - think DWM): must NOT
    // consume anything or set T4.
    Event p1{}; p1.kind = Event::kFirstPresent; p1.pid = 900; p1.qpc = 1500; p1.aux = 173;
    // GPU child presents at 1600, but pid 300 is not in the tree yet.
    Event p2{}; p2.kind = Event::kFirstPresent; p2.pid = 300; p2.qpc = 1600; p2.aux = 173;
    pq.push(p1); pq.push(p2);
    long long d = 0;
    tl.drain_one(q, pq, d, d);  // present pid 900 -> cached, rejected
    tl.drain_one(q, pq, d, d);  // present pid 300 -> cached, rejected
    CHECK(!tl.first_present_seen());
    CHECK_EQ(tl.anchors().t4, 0ll);

    // The child's Process/Start arrives AFTER its present (both ETW, near-
    // simultaneous in reality). Tree grows -> revisit accepts the cache.
    Event ps{};
    ps.kind = Event::kProcessStart; ps.pid = 300; ps.parent_pid = 100; ps.qpc = 1550;
    std::strcpy(ps.name, "gpu-child.exe");
    q.push(ps);
    tl.drain_one(q, pq, d, d);

    CHECK(tl.first_present_seen());
    CHECK_EQ(tl.anchors().t4, 1600ll);              // the cached present won
    CHECK_EQ(tl.anchors().present_event_id, 173ll);
}

TEST(timeline_present_earliest_tracked_wins) {
    // With the tree complete, several presents arrive from tracked pids (and
    // one from an untracked pid in between): the EARLIEST tracked one is T4.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q(16);
    EventQueue pq(16);
    // Tree: 100 (root) -> 300 (GPU child).
    Event ps{};
    ps.kind = Event::kProcessStart; ps.pid = 300; ps.parent_pid = 100; ps.qpc = 1100;
    std::strcpy(ps.name, "gpu-child.exe");
    q.push(ps);
    long long d = 0;
    tl.drain_one(q, pq, d, d);

    Event p1{}; p1.kind = Event::kFirstPresent; p1.pid = 300; p1.qpc = 5000; p1.aux = 173;
    Event p2{}; p2.kind = Event::kFirstPresent; p2.pid = 900; p2.qpc = 4500; p2.aux = 173;
    Event p3{}; p3.kind = Event::kFirstPresent; p3.pid = 100; p3.qpc = 4000; p3.aux = 171;
    pq.push(p1); pq.push(p2); pq.push(p3);
    for (int i = 0; i < 3; ++i) tl.drain_one(q, pq, d, d);

    // Earliest TRACKED present is p3 (root itself, 4000); p2 (untracked)
    // must be ignored even though it is earlier than p1.
    CHECK(tl.first_present_seen());
    CHECK_EQ(tl.anchors().t4, 4000ll);
    CHECK_EQ(tl.anchors().present_event_id, 171ll);
}

// ===========================================================================
// Timeline window-cache + install-root adoption tests
// ===========================================================================

TEST(timeline_window_cached_until_adoption) {
    // Regression (Edge startup boost): a reused pre-existing instance shows
    // its window BEFORE adoption completes. The CREATE/SHOW events must be
    // cached and accepted on adoption, not dropped.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("msedge.exe"); t.set_t0(1000);
    t.set_root(50, 1000);   // short-lived launcher forwarder
    Timeline tl(c, t, "msedge.exe");

    EventQueue q(16); EventQueue pq(16);
    // Window from pid 700 (pre-existing browser, not in tree yet).
    Event wc{}; wc.kind = Event::kWindowCreate; wc.pid = 700; wc.qpc = 1400; wc.aux = 0xA1;
    Event ws{}; ws.kind = Event::kWindowShow;   ws.pid = 700; ws.qpc = 1500; ws.aux = 0xA1;
    q.push(wc); q.push(ws);
    long long d = 0;
    tl.drain_one(q, pq, d, d);  // CREATE -> untracked -> cached
    tl.drain_one(q, pq, d, d);  // SHOW  -> untracked -> cached
    CHECK_EQ(tl.anchors().t2, 0ll);   // nothing accepted yet

    // Reuse adoption happens out-of-band (orchestrator path).
    CHECK(t.adopt_existing(700, "msedge.exe", 300));
    tl.on_adoption();
    tl.finalize_windows();

    CHECK_EQ(tl.anchors().t2, 1400ll);   // cached CREATE recovered
    CHECK_EQ(tl.anchors().t3, 1500ll);   // cached SHOW recovered
}

TEST(timeline_window_cached_until_tree_growth) {
    // Same cache path, but the pid enters the tree via a normal Process/Start
    // (parent chain) instead of explicit adoption.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q(16); EventQueue pq(16);
    Event wc{}; wc.kind = Event::kWindowCreate; wc.pid = 300; wc.qpc = 2000; wc.aux = 0xB1;
    q.push(wc);
    long long d = 0;
    tl.drain_one(q, pq, d, d);          // window cached (300 untracked)
    CHECK_EQ(tl.anchors().t2, 0ll);

    Event ps{};
    ps.kind = Event::kProcessStart; ps.pid = 300; ps.parent_pid = 100; ps.qpc = 1900;
    std::strcpy(ps.name, "gpu.exe");
    q.push(ps);
    tl.drain_one(q, pq, d, d);          // tree grows -> revisit accepts window

    tl.finalize_windows();
    CHECK_EQ(tl.anchors().t2, 2000ll);
    CHECK_EQ(tl.anchors().t3, 2000ll);  // no SHOW: T3 falls back to T2
}

TEST(timeline_path_is_under) {
    // Boundary logic for install-root matching (pure string, unit-testable).
    CHECK(Timeline::path_is_under("c:\\a\\b\\3.5.1", "c:\\a\\b"));       // subdir
    CHECK(Timeline::path_is_under("c:\\a\\b", "c:\\a\\b"));              // same dir
    CHECK(!Timeline::path_is_under("c:\\a\\bc", "c:\\a\\b"));            // sibling prefix
    CHECK(!Timeline::path_is_under("c:\\x", "c:\\a\\b"));                // elsewhere
    CHECK(!Timeline::path_is_under("", "c:\\a\\b"));                     // empty child
    CHECK(!Timeline::path_is_under("c:\\a\\b", ""));                     // empty root
}

TEST(tracker_adopt_dir_orphan) {
    // Install-root orphan adoption: different exe name, external parent, but
    // the caller (Timeline) verified the image directory. Children chain in
    // afterwards via the normal parent rule.
    PidTracker t;
    t.set_target("sodamusiclauncher.exe"); t.set_t0(1000); t.set_root(50, 1000);

    CHECK(t.adopt_dir_orphan(300, 999, "sodamusic.exe", 1200));
    CHECK(t.contains(300));
    CHECK(t.adopted_any());
    CHECK(!t.reuse_adopted());           // not the pre-existing-instance path

    CHECK(t.consider(400, 300, "gpu.exe", 1300));   // child of dir orphan
    CHECK(t.contains(400));
}

TEST(timeline_error_dialog_title_match) {
    // Error-dialog predicate (pure string, CJK as escaped code points).
    CHECK(Timeline::title_matches_error(L"\x51fa\x73b0\x4e86\x9519\x8bef - PowerPoint"));  // 出现了错误
    CHECK(Timeline::title_matches_error(L"\x9519\x8bef"));                                // 错误
    CHECK(Timeline::title_matches_error(L"\x8b66\x544a: file not found"));                // 警告
    CHECK(Timeline::title_matches_error(L"An unexpected ERROR occurred"));
    CHECK(Timeline::title_matches_error(L"Warning: low disk"));
    CHECK(!Timeline::title_matches_error(L"PPT-100M-COUNT - PowerPoint"));
    CHECK(!Timeline::title_matches_error(L"Microsoft Excel"));
    CHECK(!Timeline::title_matches_error(L""));
    CHECK(!Timeline::title_matches_error(nullptr));
}

TEST(timeline_error_dialog_not_chosen) {
    // Regression (PowerPoint + unactivated Office): an error dialog appears
    // LATE and stays alive - the "latest alive" heuristic alone would pick it
    // and report the dialog's appearance as the paint time. Fake hwnds make
    // IsWindow() fail, so title checks pass through harmlessly; this test
    // guards the structural rule via the string predicate + selection order.
    // (The full HWND path needs a live window; the predicate above covers it.)
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q(16); EventQueue pq(16);
    // Main window: CREATE 1500, SHOW 1600 (survives).
    Event mc{}; mc.kind = Event::kWindowCreate; mc.pid = 100; mc.qpc = 1500; mc.aux = 0xA1;
    Event ms{}; ms.kind = Event::kWindowShow;   ms.pid = 100; ms.qpc = 1600; ms.aux = 0xA1;
    // Error dialog: CREATE 5000, SHOW 5100 (later, also survives - fake hwnd
    // so IsWindow()==false and the title query can't flag it; with a REAL
    // hwnd it WOULD be skipped by is_error_title).
    Event ec{}; ec.kind = Event::kWindowCreate; ec.pid = 100; ec.qpc = 5000; ec.aux = 0xB1;
    Event es{}; es.kind = Event::kWindowShow;   es.pid = 100; es.qpc = 5100; es.aux = 0xB1;
    q.push(mc); q.push(ms); q.push(ec); q.push(es);
    long long d = 0;
    for (int i = 0; i < 4; ++i) tl.drain_one(q, pq, d, d);
    tl.finalize_windows();
    // With fake hwnds both are "untitled": latest alive wins (the dialog).
    // This documents the dependency on IsWindow+title for the real path.
    CHECK_EQ(tl.anchors().t2, 5000ll);
}

TEST(timeline_fg_wins_over_late_untitled) {
    // Regression (PowerPoint Protected View): the real main window gets
    // FOREGROUND early (fg=1600); a late, untitled helper window appears
    // afterwards (create=5000, no show/fg). The earliest FOREGROUND must win -
    // "latest create" alone would pick the helper.
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    EventQueue q(16); EventQueue pq(16);
    // main: CREATE 1400, SHOW 1500, FG 1600 (what the user sees).
    Event mc{}; mc.kind = Event::kWindowCreate; mc.pid = 100; mc.qpc = 1400; mc.aux = 0xA1;
    Event ms{}; ms.kind = Event::kWindowShow;   ms.pid = 100; ms.qpc = 1500; ms.aux = 0xA1;
    Event mf{}; mf.kind = Event::kWindowForeground; mf.pid = 100; mf.qpc = 1600; mf.aux = 0xA1;
    // late helper: CREATE 5000, nothing else (alive, untitled).
    Event hc{}; hc.kind = Event::kWindowCreate; hc.pid = 100; hc.qpc = 5000; hc.aux = 0xB1;
    q.push(mc); q.push(ms); q.push(mf); q.push(hc);
    long long d = 0;
    for (int i = 0; i < 4; ++i) tl.drain_one(q, pq, d, d);
    tl.finalize_windows();

    CHECK_EQ(tl.anchors().t2, 1400ll);   // main CREATE, not helper's 5000
    CHECK_EQ(tl.anchors().t3, 1500ll);   // earliest of show/fg = SHOW 1500
}

TEST(timeline_largest_area_wins_over_late_small) {
    // Real windows (title/area queries need live HWNDs): a big main window
    // created EARLY must beat a small helper created LATE - the area rule
    // catches what "latest create" and even "earliest foreground" miss
    // (e.g. a small pre-main dialog that steals the foreground).
    PidTracker t;
    QpcClock& c = QpcClock::instance();
    t.set_target("app.exe"); t.set_t0(1000); t.set_root(100, 1000);
    Timeline tl(c, t, "app.exe");

    HWND big = CreateWindowExW(0, L"STATIC", L"MainDocument",
                               WS_OVERLAPPEDWINDOW, 10, 10, 1200, 800,
                               nullptr, nullptr, nullptr, nullptr);
    HWND small = CreateWindowExW(0, L"STATIC", L"Helper",
                                 WS_OVERLAPPEDWINDOW, 10, 10, 200, 100,
                                 nullptr, nullptr, nullptr, nullptr);
    CHECK(big != nullptr);
    CHECK(small != nullptr);

    EventQueue q(16); EventQueue pq(16);
    // main: CREATE 1400 (big). helper: CREATE 5000 + FG 5100 (small, late,
    // steals the foreground). Area must win over both lateness and fg.
    Event mc{}; mc.kind = Event::kWindowCreate; mc.pid = 100; mc.qpc = 1400;
    mc.aux = reinterpret_cast<long long>(big);
    Event hc{}; hc.kind = Event::kWindowCreate; hc.pid = 100; hc.qpc = 5000;
    hc.aux = reinterpret_cast<long long>(small);
    Event hf{}; hf.kind = Event::kWindowForeground; hf.pid = 100; hf.qpc = 5100;
    hf.aux = reinterpret_cast<long long>(small);
    q.push(mc); q.push(hc); q.push(hf);
    long long d = 0;
    for (int i = 0; i < 3; ++i) tl.drain_one(q, pq, d, d);
    tl.finalize_windows();

    CHECK_EQ(tl.anchors().t2, 1400ll);   // the big window, not the late small one

    DestroyWindow(big);
    DestroyWindow(small);
}

// ===========================================================================
// Interactive-mode line parsing (Interactive.hpp)
// ===========================================================================

TEST(interactive_tokenize_line) {
    // Quoted path pasted from "Copy as path": one token, quotes stripped.
    auto t = tokenize_line("\"C:\\Program Files\\App\\app.exe\"");
    CHECK_EQ(t.size(), 1);
    CHECK(t[0] == "C:\\Program Files\\App\\app.exe");

    // Mixed command line: bare token, option, quoted arg with spaces, tail.
    t = tokenize_line("app.exe --flag \"arg with spaces\" tail");
    CHECK_EQ(t.size(), 4);
    CHECK(t[0] == "app.exe");
    CHECK(t[1] == "--flag");
    CHECK(t[2] == "arg with spaces");
    CHECK(t[3] == "tail");

    // Single quotes group too; whitespace-only input tokenizes to nothing.
    t = tokenize_line("'C:\\My App\\a.exe' x");
    CHECK_EQ(t.size(), 2);
    CHECK(t[0] == "C:\\My App\\a.exe");
    CHECK(tokenize_line("   ").empty());

    // Unterminated quote: take the rest of the line (never lose input).
    t = tokenize_line("\"unterminated path");
    CHECK_EQ(t.size(), 1);
    CHECK(t[0] == "unterminated path");
}

TEST(interactive_join_spaced_target) {
    // Unquoted path with spaces: join args until the accumulated path exists;
    // consumed args leave, the rest stay as launch arguments.
    auto exists_full = [](const std::string& p) {
        return p == "C:\\Program Files\\App\\app.exe";
    };
    std::string target = "C:\\Program";
    std::vector<std::string> args = {"Files\\App\\app.exe", "--flag", "x"};
    CHECK_EQ(join_spaced_target(target, args, exists_full), 1);
    CHECK(target == "C:\\Program Files\\App\\app.exe");
    CHECK_EQ(args.size(), 2);
    CHECK(args[0] == "--flag");

    // Nothing joins to an existing file: target and args untouched.
    std::string t2 = "nope";
    std::vector<std::string> a2 = {"a", "b"};
    CHECK_EQ(join_spaced_target(t2, a2,
                                [](const std::string&) { return false; }), 0);
    CHECK(t2 == "nope");
    CHECK_EQ(a2.size(), 2);

    // Target already exists (quoted input): no joining, args preserved.
    std::string t3 = "app.exe";
    std::vector<std::string> a3 = {"--flag"};
    CHECK_EQ(join_spaced_target(t3, a3,
                                [](const std::string& p) { return p == "app.exe"; }), 0);
    CHECK(t3 == "app.exe");
    CHECK_EQ(a3.size(), 1);
}

int main() {
    std::printf("=== startup-time core unit tests ===\n\n");

    std::printf("[EventQueue]\n");
    RUN(queue_basic_push_pop);
    RUN(queue_fifo_order);
    RUN(queue_overflow_drops_oldest);
    RUN(queue_multiproducer_no_corruption);

    std::printf("\n[PidTracker]\n");
    RUN(tracker_set_root_and_contains);
    RUN(tracker_parent_chain_adoption);
    RUN(tracker_orphan_adoption_by_name);
    RUN(tracker_orphan_rejected_before_t0);
    RUN(tracker_adopt_existing_reuse);
    RUN(tracker_earliest_start);
    RUN(tracker_root_etw_refines_start_qpc);

    std::printf("\n[ProcessRegistry]\n");
    RUN(registry_record_and_lookup);
    RUN(registry_miss_on_unknown);
    RUN(registry_overwrite_on_same_pid);
    RUN(registry_concurrent_record_lookup);

    std::printf("\n[Timeline window-lifetime]\n");
    RUN(timeline_single_window_selected);
    RUN(timeline_splash_excluded_by_destroy);
    RUN(timeline_all_destroyed_picks_longest_lived);
    RUN(timeline_error_dialog_title_match);
    RUN(timeline_error_dialog_not_chosen);
    RUN(timeline_fg_wins_over_late_untitled);
    RUN(timeline_largest_area_wins_over_late_small);

    std::printf("\n[Timeline present-correlation]\n");
    RUN(timeline_present_cached_before_tree_growth);
    RUN(timeline_present_earliest_tracked_wins);

    std::printf("\n[Timeline window-cache + install-root]\n");
    RUN(timeline_window_cached_until_adoption);
    RUN(timeline_window_cached_until_tree_growth);
    RUN(timeline_path_is_under);
    RUN(tracker_adopt_dir_orphan);

    std::printf("\n[Interactive line parsing]\n");
    RUN(interactive_tokenize_line);
    RUN(interactive_join_spaced_target);

    std::printf("\n=== %d tests, %d passed, %d failed ===\n",
                g_tests_run, g_tests_run - g_tests_failed, g_tests_failed);
    return g_tests_failed == 0 ? 0 : 1;
}
