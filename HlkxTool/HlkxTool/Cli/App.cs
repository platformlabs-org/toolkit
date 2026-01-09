using System;
using HlkxTool.Adapters.HlkSdk;
using HlkxTool.Core;

namespace HlkxTool.Cli
{
    internal sealed class App
    {
        public int Run(ParsedCommand cmd)
        {
            try
            {
                switch (cmd.Kind)
                {
                    case CommandKind.Package:
                        // 只有包操作需要 HLK SDK 装载器
                        HlkAssemblyLoader.Initialize();

                        var mutator = new HlkSdkMutator();
                        var pkg = new PackageUseCase(mutator);
                        return pkg.Execute(cmd.PackageOptions);

                    case CommandKind.Parse:
                        return new ParseUseCase().Execute(cmd.ParseOptions);

                    case CommandKind.Help:
                        Console.WriteLine(CommandLine.HelpText);
                        return (int)ExitCode.Ok;

                    default:
                        throw new ArgumentOutOfRangeException();
                }
            }
            catch (Exception ex)
            {
                Core.Log.Error("AppRunFailed", ex.ToString());
                return (int)ExitCode.Unhandled;
            }
        }
    }
}
