using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace AutoSign
{
    internal class AutoSignWorker
    {
        private const string DIALOG_CAPTION = "Token Logon";
        private const string DIALOG_CLASS = "#32770";
        private const int PASSWORD_EDIT_ID = 0x3ea;

        // Password file — single secrets location on the runner (C:\ops).
        // Kept out of C:\ops\AutoSign so the install folder stays copyable
        // without secrets; ACL the secrets dir to Administrator/SYSTEM only.
        private const string TOKEN_PASSWORD_FILE = @"C:\ops\secrets\token.pin";

        private const int SLEEP_TIME = 1000; // 1 second

        private static string _passwordCache; // Cached password
        private Thread _workerThread;
        private CancellationTokenSource _cts;

        // Simple log delegate (string only)
        private readonly Action<string> _log;

        public AutoSignWorker(Action<string> logAction)
        {
            _log = logAction ?? (_ => { });
        }

        #region Win32 API

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr GetDlgItem(IntPtr hDlg, int nIDDlgItem);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, string lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int PostMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        private const int WM_SETTEXT = 0x000C;
        private const int WM_KEYDOWN = 0x0100;
        private const int VK_RETURN = 0x0D;
        private const int GWL_STYLE = -16;
        private const int WS_VISIBLE = 0x10000000;

        #endregion

        #region Public API

        public void Start(string[] args)
        {
            try
            {
                if (args != null && args.Length > 0)
                {
                    _passwordCache = args[0];
                    _log("[INFO] Using password from command line argument.");
                }
                else
                {
                    _log("[INFO] No password in arguments. Will read from file: " + TOKEN_PASSWORD_FILE);
                }

                _cts = new CancellationTokenSource();
                _workerThread = new Thread(WorkerLoop)
                {
                    IsBackground = true,
                    Name = "AutoSignWorkerThread"
                };
                _workerThread.Start(_cts.Token);

                _log("[INFO] AutoSignWorker started.");
            }
            catch (Exception ex)
            {
                _log("[ERROR] Failed to start AutoSignWorker: " + ex);
                throw;
            }
        }

        public void Stop()
        {
            try
            {
                if (_cts != null)
                {
                    _cts.Cancel();
                }

                if (_workerThread != null && _workerThread.IsAlive)
                {
                    if (!_workerThread.Join(5000))
                    {
                        _log("[WARN] Worker thread did not stop within timeout.");
                    }
                }

                _log("[INFO] AutoSignWorker stopped.");
            }
            catch (Exception ex)
            {
                _log("[ERROR] Error while stopping AutoSignWorker: " + ex);
            }
        }

        #endregion

        #region Internal logic

        private static string GetTokenPassword(Action<string> log)
        {
            if (!string.IsNullOrEmpty(_passwordCache))
                return _passwordCache;

            try
            {
                if (File.Exists(TOKEN_PASSWORD_FILE))
                {
                    _passwordCache = File.ReadAllText(TOKEN_PASSWORD_FILE).Trim();
                    log("[INFO] Password file loaded successfully from " + TOKEN_PASSWORD_FILE);
                    return _passwordCache;
                }

                string msg = $"Password file not found: {TOKEN_PASSWORD_FILE}";
                log("[ERROR] " + msg);
                throw new FileNotFoundException(msg);
            }
            catch (Exception ex)
            {
                log("[ERROR] Error while reading password file: " + ex);
                throw;
            }
        }

        private static bool EnumHandler(IntPtr hWnd, IntPtr lParam)
        {
            var log = (Action<string>)GCHandle.FromIntPtr(lParam).Target;

            if (IsWindowVisible(hWnd))
            {
                string caption = GetWindowTextString(hWnd);
                string cls = GetClassNameString(hWnd);

                if (caption == DIALOG_CAPTION && cls == DIALOG_CLASS)
                {
                    try
                    {
                        log("[INFO] Token logon dialog detected. Trying to enter password...");

                        IntPtr ed_hwnd = GetDlgItem(hWnd, PASSWORD_EDIT_ID);
                        string pwd = GetTokenPassword(log);

                        SendMessage(ed_hwnd, WM_SETTEXT, IntPtr.Zero, pwd);
                        PostMessage(ed_hwnd, WM_KEYDOWN, (IntPtr)VK_RETURN, IntPtr.Zero);

                        log("[INFO] Password sent successfully.");
                    }
                    catch (Exception ex)
                    {
                        log("[ERROR] Failed to set password: " + ex);
                        return false;
                    }
                }
            }

            return true;
        }

        private static bool IsWindowVisible(IntPtr hWnd)
        {
            return (GetWindowLong(hWnd, GWL_STYLE) & WS_VISIBLE) != 0;
        }

        private static string GetWindowTextString(IntPtr hWnd)
        {
            const int nChars = 256;
            StringBuilder buff = new StringBuilder(nChars);
            return GetWindowText(hWnd, buff, nChars) > 0 ? buff.ToString() : null;
        }

        private static string GetClassNameString(IntPtr hWnd)
        {
            const int nChars = 256;
            StringBuilder buff = new StringBuilder(nChars);
            return GetClassName(hWnd, buff, nChars) > 0 ? buff.ToString() : null;
        }

        private void WorkerLoop(object obj)
        {
            var token = (CancellationToken)obj;

            GCHandle handle = GCHandle.Alloc(_log);
            try
            {
                IntPtr param = GCHandle.ToIntPtr(handle);

                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        EnumWindows(new EnumWindowsProc(EnumHandler), param);
                        Thread.Sleep(SLEEP_TIME);
                    }
                    catch (Exception e)
                    {
                        if (e is Win32Exception win32Exception)
                        {
                            _log($"[ERROR] Win32Exception in worker loop (NativeErrorCode={win32Exception.NativeErrorCode}): {e}");
                        }
                        else
                        {
                            _log("[ERROR] Exception in worker loop: " + e);
                        }

                        // prevent tight error loop
                        Thread.Sleep(5000);
                    }
                }
            }
            finally
            {
                if (handle.IsAllocated)
                {
                    handle.Free();
                }
            }
        }

        #endregion
    }
}
