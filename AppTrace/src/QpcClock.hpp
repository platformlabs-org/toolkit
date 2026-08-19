// QpcClock.hpp - Unified QPC timebase for ETW + WinEvent
//
// All anchors (T0..T4) are stamped via qpc_now() so that ETW EventHeader.TimeStamp
// (with Wnode.ClientContext = 1) and WinEvent callback timestamps live on the same
// monotonic counter and can be subtracted directly.
#pragma once
#include <windows.h>

namespace st {

class QpcClock {
public:
    static QpcClock& instance() {
        static QpcClock c;
        return c;
    }

    // Returns current QPC ticks (same unit as EventHeader.TimeStamp when
    // the ETW session was started with ClientContext = 1).
    static long long now() {
        LARGE_INTEGER li;
        QueryPerformanceCounter(&li);
        return li.QuadPart;
    }

    // Convert a QPC delta to milliseconds as a double (keeps fractional ms).
    double to_ms_d(long long qpc_delta) const {
        return static_cast<double>(qpc_delta) * 1000.0 / static_cast<double>(freq_);
    }

    long long freq() const { return freq_; }

private:
    QpcClock() {
        LARGE_INTEGER f;
        QueryPerformanceFrequency(&f);
        freq_ = f.QuadPart;
    }
    long long freq_ = 1;
};

} // namespace st
