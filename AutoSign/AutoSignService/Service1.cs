using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Threading;

namespace AutoSignService
{
    public partial class Service1 : ServiceBase
    {
        private EventLog _eventLog;

        private const string EventSourceName = "AutoSignService";
        private const string EventLogName = "Application";

        private Timer _timer;
        private Process _agentProcess;

        // Path to the Agent EXE after install
        private const string AgentPath = @"C:\ops\AutoSign\AutoSign.exe";

        public Service1()
        {
            InitializeComponent();
            ServiceName = "AutoSignService";

            _eventLog = new EventLog();
            try
            {
                if (!EventLog.SourceExists(EventSourceName))
                {
                    EventLog.CreateEventSource(EventSourceName, EventLogName);
                }
                _eventLog.Source = EventSourceName;
                _eventLog.Log = EventLogName;
            }
            catch
            {
                _eventLog.Source = "Application";
                _eventLog.Log = "Application";
            }
        }

        protected override void OnStart(string[] args)
        {
            Log("Service is starting...", EventLogEntryType.Information);

            // Check Agent every 5 seconds
            _timer = new Timer(CheckAgent, null, TimeSpan.Zero, TimeSpan.FromSeconds(5));

            Log("Service started.", EventLogEntryType.Information);
        }

        protected override void OnStop()
        {
            Log("Service is stopping...", EventLogEntryType.Information);

            _timer?.Dispose();
            _timer = null;

            try
            {
                if (_agentProcess != null && !_agentProcess.HasExited)
                {
                    _agentProcess.Kill();
                    _agentProcess.Dispose();
                }
            }
            catch (Exception ex)
            {
                Log("Error stopping agent process: " + ex, EventLogEntryType.Error);
            }

            Log("Service stopped.", EventLogEntryType.Information);
        }

        private void CheckAgent(object state)
        {
            try
            {
                if (_agentProcess == null || _agentProcess.HasExited)
                {
                    Log("Agent is not running. Attempting to start AutoSignAgent...", EventLogEntryType.Information);
                    StartAgentInActiveSession();
                }
            }
            catch (Exception ex)
            {
                Log("CheckAgent error: " + ex, EventLogEntryType.Error);
            }
        }

        private void StartAgentInActiveSession()
        {
            if (!System.IO.File.Exists(AgentPath))
            {
                Log("Agent executable not found: " + AgentPath, EventLogEntryType.Error);
                return;
            }

            uint sessionId = WTSGetActiveConsoleSessionId();
            if (sessionId == 0xFFFFFFFF)
            {
                Log("No active console session found.", EventLogEntryType.Warning);
                return;
            }

            IntPtr userToken = IntPtr.Zero;
            IntPtr dupToken = IntPtr.Zero;
            IntPtr envBlock = IntPtr.Zero;

            try
            {
                if (!WTSQueryUserToken(sessionId, out userToken))
                {
                    int err = Marshal.GetLastWin32Error();
                    Log($"WTSQueryUserToken failed. Error={err}", EventLogEntryType.Error);
                    return;
                }

                var sa = new SECURITY_ATTRIBUTES();
                sa.nLength = Marshal.SizeOf(sa);
                sa.bInheritHandle = false;

                const uint TOKEN_ALL_ACCESS = 0x000F01FF;

                if (!DuplicateTokenEx(
                        userToken,
                        TOKEN_ALL_ACCESS,
                        ref sa,
                        (int)SECURITY_IMPERSONATION_LEVEL.SecurityIdentification,
                        (int)TOKEN_TYPE.TokenPrimary,
                        out dupToken))
                {
                    int err = Marshal.GetLastWin32Error();
                    Log($"DuplicateTokenEx failed. Error={err}", EventLogEntryType.Error);
                    return;
                }

                if (!CreateEnvironmentBlock(out envBlock, dupToken, false))
                {
                    int err = Marshal.GetLastWin32Error();
                    Log($"CreateEnvironmentBlock failed. Error={err}", EventLogEntryType.Error);
                    return;
                }

                var si = new STARTUPINFO();
                si.cb = Marshal.SizeOf(si);
                si.lpDesktop = @"winsta0\default"; // attach to the user's desktop

                var pi = new PROCESS_INFORMATION();

                string cmdLine = $"\"{AgentPath}\"";

                const int CREATE_UNICODE_ENVIRONMENT = 0x00000400;
                const int CREATE_NEW_CONSOLE = 0x00000010;

                bool result = CreateProcessAsUser(
                    dupToken,
                    null,
                    new StringBuilder(cmdLine),
                    ref sa,
                    ref sa,
                    false,
                    CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_CONSOLE,
                    envBlock,
                    null,
                    ref si,
                    out pi);

                if (!result)
                {
                    int err = Marshal.GetLastWin32Error();
                    Log($"CreateProcessAsUser failed. Error={err}", EventLogEntryType.Error);
                    return;
                }

                _agentProcess = Process.GetProcessById(pi.dwProcessId);
                Log($"AutoSignAgent started in session {sessionId}, PID={pi.dwProcessId}", EventLogEntryType.Information);

                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
            }
            finally
            {
                if (envBlock != IntPtr.Zero)
                {
                    DestroyEnvironmentBlock(envBlock);
                }

                if (dupToken != IntPtr.Zero)
                {
                    CloseHandle(dupToken);
                }

                if (userToken != IntPtr.Zero)
                {
                    CloseHandle(userToken);
                }
            }
        }

        private void Log(string message, EventLogEntryType type)
        {
            try
            {
                _eventLog.WriteEntry(message, type);
            }
            catch
            {
                // ignore logging failures
            }
        }

        #region P/Invoke

        [DllImport("kernel32.dll")]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint SessionId, out IntPtr Token);

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)]
            public bool bInheritHandle;
        }

        private enum SECURITY_IMPERSONATION_LEVEL
        {
            SecurityAnonymous,
            SecurityIdentification,
            SecurityImpersonation,
            SecurityDelegation
        }

        private enum TOKEN_TYPE
        {
            TokenPrimary = 1,
            TokenImpersonation
        }

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(
            IntPtr hExistingToken,
            uint dwDesiredAccess,
            ref SECURITY_ATTRIBUTES lpTokenAttributes,
            int ImpersonationLevel,
            int TokenType,
            out IntPtr phNewToken);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(
            out IntPtr lpEnvironment,
            IntPtr hToken,
            bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            StringBuilder lpCommandLine,
            ref SECURITY_ATTRIBUTES lpProcessAttributes,
            ref SECURITY_ATTRIBUTES lpThreadAttributes,
            bool bInheritHandles,
            int dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        #endregion
    }
}
