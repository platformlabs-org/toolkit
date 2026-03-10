using System;

namespace UnderRun.Contracts.Services;

public interface IUnderrunMonitorService
{
    void RegisterUpdateCallback(Action<int, int, int, int> updateCallback);
    void Start();
    void Stop();
    (int a, int b, int c, int d) GetCurrentStatus();
}
