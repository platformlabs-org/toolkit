using System;
using System.Runtime.InteropServices;
using UnderRun.Contracts.Services;

namespace UnderRun.Services;

public class WindowService : IWindowService
{
    public void SetAlwaysOnTop(bool isOnTop)
    {
        var window = (App.Current as App)?.MainWindow;
        if (window == null) return;

        try
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(window);

            const int SWP_NOMOVE = 0x0002;
            const int SWP_NOSIZE = 0x0001;
            const int HWND_TOPMOST = -1;
            const int HWND_NOTOPMOST = -2;

            SetWindowPos(hwnd,
                isOnTop ? (IntPtr)HWND_TOPMOST : (IntPtr)HWND_NOTOPMOST,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE);
        }
        catch (Exception)
        {
            // Ignore if window handle cannot be retrieved or set
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetWindowPos(
        IntPtr hWnd,
        IntPtr hWndInsertAfter,
        int X,
        int Y,
        int cx,
        int cy,
        int uFlags);
}
