using System;
using System.Threading;

namespace AutoSign
{
    internal static class Program
    {
        static void Main(string[] args)
        {
            // Console logger
            void Log(string msg)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {msg}");
            }

            var worker = new AutoSignWorker(Log);

            try
            {
                worker.Start(args);
                Console.WriteLine("AutoSign Agent started. Press Ctrl + C to exit.");

                var quitEvent = new ManualResetEvent(false);
                Console.CancelKeyPress += (s, e) =>
                {
                    e.Cancel = true;
                    quitEvent.Set();
                };
                quitEvent.WaitOne();
            }
            finally
            {
                worker.Stop();
            }
        }
    }
}
