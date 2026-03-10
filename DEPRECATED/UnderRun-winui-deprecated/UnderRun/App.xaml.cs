using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.UI.Xaml;
using UnderRun.Contracts.Services;
using UnderRun.Services;
using UnderRun.ViewModels;
using UnderRun.Views;

namespace UnderRun;

public partial class App : Application
{
    private Window? _window;
    public Window? MainWindow => _window;

    public static IHost Host { get; private set; }

    public App()
    {
        InitializeComponent();

        Host = Microsoft.Extensions.Hosting.Host.
            CreateDefaultBuilder().
            UseContentRoot(AppContext.BaseDirectory).
            ConfigureServices((context, services) =>
            {
                // Core Services
                services.AddTransient<IDriverService, DriverService>();
                services.AddSingleton<IUnderrunMonitorService, UnderrunMonitorService>();
                services.AddTransient<ISoundService, SoundService>();
                services.AddTransient<IWindowService, WindowService>();

                // ViewModels
                services.AddTransient<UnderRunViewModel>();

                // Views
                services.AddTransient<UnderRunPage>();
                services.AddTransient<MainWindow>();
            }).
            Build();
    }

    protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
