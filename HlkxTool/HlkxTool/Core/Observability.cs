using System;
using System.Diagnostics;

namespace HlkxTool.Core
{
    internal static class Log
    {
        private static string _correlationId = "na";

        public static void Init(string correlationId)
        {
            _correlationId = correlationId ?? "na";
        }

        public static void Info(string evt, string message) => Write("INFO", evt, message);
        public static void Warn(string evt, string message) => Write("WARN", evt, message);
        public static void Error(string evt, string message) => Write("ERROR", evt, message);

        private static void Write(string level, string evt, string message)
        {
            string ts = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz");
            Console.Error.WriteLine(ts + " [" + level + "] [" + evt + "] [cid=" + _correlationId + "] " + message);
        }

        public static TimedScope Time(string evt, string message)
        {
            Info(evt, message);
            return new TimedScope(evt);
        }

        internal struct TimedScope : IDisposable
        {
            private readonly string _evt;
            private readonly Stopwatch _sw;

            public TimedScope(string evt)
            {
                _evt = evt;
                _sw = Stopwatch.StartNew();
            }

            public void Dispose()
            {
                _sw.Stop();
                //Info(_evt, "Done in " + _sw.ElapsedMilliseconds + "ms");
            }
        }
    }
}
