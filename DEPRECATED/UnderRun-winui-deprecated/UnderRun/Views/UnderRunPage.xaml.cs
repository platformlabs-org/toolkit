using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using UnderRun.ViewModels;
using Microsoft.Extensions.DependencyInjection;
using System;

namespace UnderRun.Views;

public sealed partial class UnderRunPage : Page
{
    public UnderRunViewModel ViewModel { get; }

    private ContentDialog? _errorDialog;

    public UnderRunPage()
    {
        // Resolve ViewModel from the App's Host
        ViewModel = App.Host.Services.GetRequiredService<UnderRunViewModel>();
        InitializeComponent();

        // DataContext is often set in XAML, but setting it here ensures it's linked
        DataContext = ViewModel;

        Loaded += OnPageLoaded;
        Unloaded += OnPageUnloaded;

        ViewModel.ShowErrorDialogRequested += OnShowErrorDialogRequested;
    }

    private void OnPageLoaded(object sender, RoutedEventArgs e)
    {
        ViewModel.OnPageLoaded();
    }

    private void OnPageUnloaded(object sender, RoutedEventArgs e)
    {
        ViewModel.OnPageUnloaded();
    }

    private async void OnShowErrorDialogRequested()
    {
        if (_errorDialog != null)
            return;

        // ContentDialog requires XamlRoot to be set
        if (this.XamlRoot == null) return;

        _errorDialog = new ContentDialog
        {
            Title = "UnderRun Error",
            Content = "An UnderRun error has been detected! Please check the related devices.",
            CloseButtonText = "Close",
            XamlRoot = this.XamlRoot,
            DefaultButton = ContentDialogButton.Close
        };

        _errorDialog.Closed += ErrorDialog_Closed;
        await _errorDialog.ShowAsync();
    }

    private void ErrorDialog_Closed(ContentDialog sender, ContentDialogClosedEventArgs args)
    {
        ViewModel.OnErrorDialogClosed();
        _errorDialog = null;
    }
}
