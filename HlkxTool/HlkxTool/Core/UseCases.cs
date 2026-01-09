using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using HlkxTool.Cli;
using HlkxTool.Hlkx;

namespace HlkxTool.Core
{
    internal sealed class PackageUseCase
    {
        private readonly Adapters.HlkSdk.HlkSdkMutator _mutator;

        public PackageUseCase(Adapters.HlkSdk.HlkSdkMutator mutator)
        {
            _mutator = mutator;
        }

        public int Execute(PackageCommandOptions opt)
        {
            if (opt.ShowHelp)
            {
                Console.WriteLine(Cli.CommandLine.HelpText);
                return (int)ExitCode.Ok;
            }

            if (string.IsNullOrWhiteSpace(opt.PackagePath))
                throw new ArgumentException("Missing --package (or package path)");

            if (string.IsNullOrWhiteSpace(opt.OutputFile))
                throw new ArgumentException("Missing --out");

            try
            {
                switch (opt.Mode)
                {
                    case PackageMode.Whql:
                        if (string.IsNullOrWhiteSpace(opt.DriverPath))
                            throw new ArgumentException("WHQL mode requires --driver");
                        _mutator.WhqlMergeAddSign(opt.PackagePath, opt.DriverPath, opt.OutputFile);
                        break;

                    case PackageMode.Dua:
                        if (string.IsNullOrWhiteSpace(opt.DriverPath))
                            throw new ArgumentException("DUA mode requires --driver");
                        _mutator.DuaReplaceDriverAndSign(opt.PackagePath, opt.DriverPath, opt.OutputFile);
                        break;

                    case PackageMode.Sign:
                        _mutator.SignOnly(opt.PackagePath, opt.OutputFile);
                        break;

                    default:
                        throw new ArgumentOutOfRangeException();
                }

                return (int)ExitCode.Ok;
            }
            catch (Exception ex)
            {
                Log.Error("PackageOpFailed", ex.Message);
                return (int)ExitCode.PackageOpFailed;
            }
        }
    }

    internal sealed class ParseUseCase
    {
        private readonly HlkxAnalyzer _analyzer = new HlkxAnalyzer();

        public int Execute(ParseOptions opt)
        {
            if (opt.ShowHelp)
            {
                Console.WriteLine(Cli.CommandLine.HelpText);
                return (int)ExitCode.Ok;
            }

            string hlkxPath = (opt.HlkxPath ?? "").Trim().Trim('"');
            if (string.IsNullOrWhiteSpace(hlkxPath))
                throw new ArgumentException("Missing --hlkx");

            HlkxAnalysisResult analysis = _analyzer.Parse(
                hlkxPath,
                opt.VerifySignatures,
                parsePackageInfo: true
            );

            // Construct simple JSON output
            var output = new ParseOutputJson
            {
                IsSigned = analysis.Signature.ConsideredSigned,
                DeviceMetadataCategory = analysis.PackageInfo.DeviceMetadataCategory ?? "",
                SelectedProductTypes = analysis.PackageInfo.SelectedProductTypes,
                RequestedSignatures = analysis.PackageInfo.RequestedSignatures
            };

            // Print only the JSON to stdout
            string json = JsonSerializer.Serialize(output, JsonOptions.Indented);
            Console.WriteLine(json);

            return (int)ExitCode.Ok;
        }
    }
}
