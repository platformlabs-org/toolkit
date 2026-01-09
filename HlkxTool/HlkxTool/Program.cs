using HlkxTool.Cli;
using HlkxTool.Core;
using System;
using System.ComponentModel.Design;
using System.Text;

namespace HlkxTool
{
    internal static class Program
    {
        public static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            var correlationId = Guid.NewGuid().ToString("N");
            Log.Init(correlationId);

            try
            {
                ParsedCommand cmd = CommandLine.Parse(args);

                if (cmd.Kind == CommandKind.Help)
                {
                    Console.WriteLine(CommandLine.HelpText);
                    return (int)ExitCode.Ok;
                }

                var app = new App();
                return app.Run(cmd);
            }
            catch (Exception ex)
            {
                Log.Error("UnhandledException", ex.ToString());
                return (int)ExitCode.Unhandled;
            }
        }
    }
}
