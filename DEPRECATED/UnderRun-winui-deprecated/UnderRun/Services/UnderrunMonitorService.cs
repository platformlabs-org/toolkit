using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using UnderRun.Contracts.Services;

namespace UnderRun.Services;

public class UnderrunMonitorService : IUnderrunMonitorService
{
    private CancellationTokenSource? _cts;
    private Action<int, int, int, int>? _updateCallback;
    private int? _cachedIndex = null;

    private static readonly string[] RegPathArray =
    {
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0001",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0002",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0003",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0004",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0005",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0006",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0007",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0008",
        @"SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0009"
    };

    private static readonly string[] NameArray =
    {
        "UnderRunCountPipeA", "UnderRunCountPipeB", "UnderRunCountPipeC", "UnderRunCountPipeD"
    };

    public void RegisterUpdateCallback(Action<int, int, int, int> updateCallback)
    {
        _updateCallback = updateCallback;
    }

    public void Start()
    {
        if (_cts != null)
            return;

        _cts = new CancellationTokenSource();
        _ = Task.Run(() => MonitorLoop(_cts.Token));
    }

    public void Stop()
    {
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
    }

    private async Task MonitorLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var index = GetURIndex();
                var values = ReadUnderrunValues(index);
                _updateCallback?.Invoke(values[0], values[1], values[2], values[3]);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[MonitorLoop] Error: {ex}");
            }
            await Task.Delay(1000, token);
        }
    }

    private int[] ReadUnderrunValues(int index)
    {
        var results = new int[4];

        if (index < 0) return results;

        try
        {
            // Note: On Linux/Container this registry access will fail or do nothing unless mocked.
            // Since this is WinUI 3, it's expected to run on Windows.
            // In a Linux container environment, we might want to catch platform exceptions if we were running tests,
            // but for the purpose of writing code, we assume Windows availability or just catch generic exceptions.
            if (System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows))
            {
                using var key = Registry.LocalMachine.OpenSubKey(RegPathArray[index]);
                if (key != null)
                {
                    for (int i = 0; i < NameArray.Length; i++)
                    {
                        results[i] = ReadRegistryValue(key, NameArray[i]);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ReadUnderrunValues] Error reading registry values: {ex}");
        }

        return results;
    }

    private int ReadRegistryValue(RegistryKey key, string valueName)
    {
        try
        {
            var value = key.GetValue(valueName);
            if (value is int iVal) return iVal;
            if (value is byte[] bytes && bytes.Length >= 4)
            {
                return BitConverter.ToInt32(new byte[] { bytes[3], bytes[2], bytes[1], bytes[0] }, 0);
            }
        }
        catch
        {
            // Ignore
        }
        return 0;
    }

    private int GetURIndex()
    {
        if (_cachedIndex.HasValue)
            return _cachedIndex.Value;

        if (!System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows))
            return -1;

        try {
            for (int i = 0; i < RegPathArray.Length; i++)
            {
                using var key = Registry.LocalMachine.OpenSubKey(RegPathArray[i]);
                if (key != null)
                {
                    foreach (var valueName in NameArray)
                    {
                        if (key.GetValue(valueName) != null)
                        {
                            _cachedIndex = i;
                            return i;
                        }
                    }
                }
            }
        } catch {}
        return -1;
    }

    public (int a, int b, int c, int d) GetCurrentStatus()
    {
        var index = GetURIndex();
        var values = ReadUnderrunValues(index);
        return (values[0], values[1], values[2], values[3]);
    }
}
