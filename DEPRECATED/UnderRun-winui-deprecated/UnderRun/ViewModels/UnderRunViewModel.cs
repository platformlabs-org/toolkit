using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.UI.Dispatching;
using System;
using System.Threading.Tasks;
using Windows.ApplicationModel;
using UnderRun.Contracts.Services;

namespace UnderRun.ViewModels;

public partial class UnderRunViewModel : ObservableObject
{
    private readonly IUnderrunMonitorService _monitorService;
    private readonly ISoundService _soundService;
    private readonly IDriverService _driverService;
    private readonly IWindowService _windowService;
    private readonly DispatcherQueue _dispatcherQueue;

    private readonly Uri _customSoundUri = new("ms-appx:///Assets/Sounds/arp-bells_140bpm_D_minor.wav");

    // Event for View
    public event Action? ShowErrorDialogRequested;

    private bool _wasAnyPipeError = false;
    private bool _isErrorDialogVisible = false;
    private bool _isInitializing = false;

    [ObservableProperty]
    private bool isSoundEnabled = true;

    [ObservableProperty]
    private bool isAlwaysOnTop = true;

    [ObservableProperty]
    private bool isRunOnStartup;

    [ObservableProperty]
    private int pipeA;
    [ObservableProperty]
    private int pipeB;
    [ObservableProperty]
    private int pipeC;
    [ObservableProperty]
    private int pipeD;

    [ObservableProperty]
    private string driverVersion = "Loading...";

    public bool IsPipeAError => PipeA != 0;
    public bool IsPipeBError => PipeB != 0;
    public bool IsPipeCError => PipeC != 0;
    public bool IsPipeDError => PipeD != 0;

    public UnderRunViewModel(
        IUnderrunMonitorService monitorService,
        ISoundService soundService,
        IDriverService driverService,
        IWindowService windowService)
    {
        _dispatcherQueue = DispatcherQueue.GetForCurrentThread();

        _monitorService = monitorService;
        _soundService = soundService;
        _driverService = driverService;
        _windowService = windowService;
    }

    public async void OnPageLoaded()
    {
        // Register callback
        _monitorService.RegisterUpdateCallback((a, b, c, d) =>
        {
            _dispatcherQueue.TryEnqueue(() => UpdateStatus(a, b, c, d));
        });

        _monitorService.Start();

        await LoadIGPUDriverVersionAsync();

        if (IsAlwaysOnTop)
        {
            _windowService.SetAlwaysOnTop(true);
        }

        // Initialize Startup Task state
        await InitializeStartupStateAsync();

        // Check immediately
        var (a, b, c, d) = _monitorService.GetCurrentStatus();
        UpdateStatus(a, b, c, d);
    }

    public void OnPageUnloaded()
    {
        _monitorService.Stop();
        _windowService.SetAlwaysOnTop(false);
        _soundService.StopSound();

        _isErrorDialogVisible = false;
        _wasAnyPipeError = false;
    }

    partial void OnIsAlwaysOnTopChanged(bool value)
    {
        _windowService.SetAlwaysOnTop(value);
    }

    partial void OnIsRunOnStartupChanged(bool value)
    {
        HandleRunOnStartupChanged(value);
    }

    private async Task InitializeStartupStateAsync()
    {
        _isInitializing = true;
        try
        {
            var startupTask = await StartupTask.GetAsync("Startup");
            IsRunOnStartup = startupTask.State == StartupTaskState.Enabled;
        }
        catch (Exception)
        {
            IsRunOnStartup = false;
        }
        finally
        {
            _isInitializing = false;
        }
    }

    private async void HandleRunOnStartupChanged(bool isEnabled)
    {
        if (_isInitializing)
        {
            return;
        }

        try
        {
            var startupTask = await StartupTask.GetAsync("Startup");
            if (isEnabled)
            {
                if (startupTask.State != StartupTaskState.Enabled)
                {
                    var state = await startupTask.RequestEnableAsync();
                    if (state != StartupTaskState.Enabled)
                    {
                        IsRunOnStartup = false;
                    }
                }
            }
            else
            {
                if (startupTask.State == StartupTaskState.Enabled)
                {
                    startupTask.Disable();
                }
            }
        }
        catch (Exception)
        {
            _isInitializing = true;
            IsRunOnStartup = !isEnabled;
            _isInitializing = false;
        }
    }

    private async Task LoadIGPUDriverVersionAsync()
    {
        try
        {
            var igpuDriver = await _driverService.GetIntelIGPUDriverAsync();
            DriverVersion = igpuDriver?.Version?.ToString() ?? "Not found";
        }
        catch (Exception ex)
        {
            DriverVersion = $"Error: {ex.Message}";
        }
    }

    private void UpdateStatus(int a, int b, int c, int d)
    {
        PipeA = a;
        PipeB = b;
        PipeC = c;
        PipeD = d;

        OnPropertyChanged(nameof(IsPipeAError));
        OnPropertyChanged(nameof(IsPipeBError));
        OnPropertyChanged(nameof(IsPipeCError));
        OnPropertyChanged(nameof(IsPipeDError));

        var isAnyPipeError = a != 0 || b != 0 || c != 0 || d != 0;

        if (IsSoundEnabled && isAnyPipeError && !_wasAnyPipeError && !_isErrorDialogVisible)
        {
            _soundService.PlayCustomSound(_customSoundUri);
            _isErrorDialogVisible = true;
            ShowErrorDialogRequested?.Invoke();
        }

        if (!isAnyPipeError)
        {
            _isErrorDialogVisible = false;
        }

        _wasAnyPipeError = isAnyPipeError;
    }

    public void OnErrorDialogClosed()
    {
        _soundService.StopSound();
    }

    public void PlayTestSound()
    {
        _soundService.PlayCustomSound(_customSoundUri);
    }
}
