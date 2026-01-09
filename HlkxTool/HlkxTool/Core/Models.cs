using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json.Serialization;

namespace HlkxTool.Core
{
    internal enum CommandKind
    {
        Help,
        Parse,
        Package
    }

    internal enum PackageMode
    {
        Whql,
        Dua,
        Sign
    }

    internal enum ExitCode
    {
        Ok = 0,
        BadArguments = 2,
        FileNotFound = 3,
        NotSigned = 10,
        SignatureVerifyFailed = 11,
        PackageInfoMissing = 20,
        UserCanceled = 30,
        ApiFailed = 40,
        UploadFailed = 41,
        StartFailed = 42,
        PackageOpFailed = 50,
        Unhandled = 99
    }

    internal sealed class PackageCommandOptions
    {
        public PackageMode Mode { get; private set; }
        public string PackagePath { get; private set; }
        public string DriverPath { get; private set; }
        public string OutputFile { get; private set; }
        public bool ShowHelp { get; private set; }

        public PackageCommandOptions(PackageMode mode, string packagePath, string driverPath, string outputFile, bool showHelp = false)
        {
            Mode = mode;
            PackagePath = packagePath;
            DriverPath = driverPath;
            OutputFile = outputFile;
            ShowHelp = showHelp;
        }
    }

    internal sealed class ParseOptions
    {
        public bool ShowHelp { get; private set; }
        public string HlkxPath { get; private set; }
        public bool VerifySignatures { get; private set; }

        public ParseOptions(bool showHelp, string hlkxPath, bool verify)
        {
            ShowHelp = showHelp;
            HlkxPath = hlkxPath;
            VerifySignatures = verify;
        }

        public static ParseOptions Parse(string[] args)
        {
            bool showHelp = false;
            bool verify = false;
            string hlkx = null;

            for (int i = 0; i < (args ?? new string[0]).Length; i++)
            {
                string a = (args[i] ?? "").Trim();
                if (a.Length == 0) continue;

                switch (a)
                {
                    case "--help":
                    case "-h":
                    case "/?":
                        showHelp = true;
                        break;
                    case "--verify":
                        verify = true;
                        break;
                    case "--hlkx":
                        hlkx = NextValue(args, ref i, "--hlkx");
                        break;
                    default:
                        // 允许直接丢路径
                        string maybe = Unquote(a);
                        if (hlkx == null && System.IO.File.Exists(maybe))
                            hlkx = maybe;
                        break;
                }

                if (showHelp) break;
            }

            return new ParseOptions(showHelp, hlkx, verify);
        }

        private static string NextValue(string[] args, ref int i, string key)
        {
            if (i + 1 >= args.Length)
                throw new ArgumentException("缺少参数值: " + key);
            i++;
            return Unquote(args[i]);
        }

        private static string Unquote(string s) => (s ?? "").Trim().Trim('"');
    }

    internal sealed class ParseOutputJson
    {
        [JsonPropertyName("isSigned")]
        public bool IsSigned { get; set; }

        [JsonPropertyName("deviceMetadataCategory")]
        public string DeviceMetadataCategory { get; set; }

        [JsonPropertyName("selectedProductTypes")]
        public Dictionary<string, string> SelectedProductTypes { get; set; }

        [JsonPropertyName("requestedSignatures")]
        public List<string> RequestedSignatures { get; set; }
    }

    internal static class JsonOptions
    {
        public static readonly System.Text.Json.JsonSerializerOptions Indented =
            new System.Text.Json.JsonSerializerOptions { WriteIndented = true };
    }
}
