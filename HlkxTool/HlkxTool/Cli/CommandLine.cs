using HlkxTool.Core;
using System;
using System.ComponentModel.Design;
using System.IO;

namespace HlkxTool.Cli
{
    internal static class CommandLine
    {
        public static readonly string HelpText =
@"HlkxTool (Merged) - .NET Framework 4.8

用法:
  HlkxTool parse   --hlkx <file> [--verify]

  HlkxTool whql    --package <folder> --driver <folder> --out <file>
  HlkxTool dua     --package <file|folder> --driver <folder> --out <file>
  HlkxTool sign    --package <file> --out <file>
";

        public static ParsedCommand Parse(string[] args)
        {
            args = args ?? new string[0];

            if (args.Length == 0)
            {
                return ParsedCommand.Help();
            }

            // help 快捷
            if (IsHelpToken(args[0]))
            {
                return ParsedCommand.Help();
            }

            // 子命令
            string head = (args[0] ?? "").Trim();
            if (EqualsIgnoreCase(head, "parse"))
            {
                return ParsedCommand.Parse(ParseOptions.Parse(Slice(args, 1)));
            }
            if (EqualsIgnoreCase(head, "whql") || EqualsIgnoreCase(head, "dua") || EqualsIgnoreCase(head, "sign"))
            {
                PackageMode m;
                if (!TryParsePackageMode(head, out m))
                    throw new ArgumentException("Invalid package mode: " + head);

                return ParsedCommand.Package(ParsePackageOptions(m, Slice(args, 1)));
            }

            return ParsedCommand.Help();
        }

        private static PackageCommandOptions ParsePackageOptions(PackageMode mode, string[] args)
        {
            string package = null;
            string driver = null;
            string output = null;

            for (int i = 0; i < args.Length; i++)
            {
                string a = (args[i] ?? "").Trim();
                if (a.Length == 0) continue;

                if (IsHelpToken(a))
                    return new PackageCommandOptions(mode, null, null, null, showHelp: true);

                switch (a)
                {
                    case "--package":
                    case "--pkg":
                        package = NextValue(args, ref i, a);
                        break;
                    case "--driver":
                        driver = NextValue(args, ref i, a);
                        break;
                    case "--out":
                    case "-o":
                        output = NextValue(args, ref i, a);
                        break;
                    default:
                        // 允许直接丢路径
                        if (package == null && (Directory.Exists(Unquote(a)) || File.Exists(Unquote(a))))
                            package = Unquote(a);
                        break;
                }
            }

            return new PackageCommandOptions(mode, package, driver, output);
        }

        private static string NextValue(string[] args, ref int i, string key)
        {
            if (i + 1 >= args.Length)
                throw new ArgumentException("Missing value for " + key);
            i++;
            return Unquote(args[i]);
        }

        private static bool TryParsePackageMode(string token, out PackageMode mode)
        {
            mode = PackageMode.Whql;
            if (EqualsIgnoreCase(token, "WHQL") || EqualsIgnoreCase(token, "whql")) { mode = PackageMode.Whql; return true; }
            if (EqualsIgnoreCase(token, "DUA") || EqualsIgnoreCase(token, "dua")) { mode = PackageMode.Dua; return true; }
            if (EqualsIgnoreCase(token, "SIGN") || EqualsIgnoreCase(token, "sign")) { mode = PackageMode.Sign; return true; }
            return false;
        }

        private static bool IsHelpToken(string s)
        {
            s = (s ?? "").Trim();
            return s == "--help" || s == "-h" || s == "/?";
        }

        private static bool EqualsIgnoreCase(string a, string b)
        {
            return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }

        private static string Unquote(string s)
        {
            return (s ?? "").Trim().Trim('"');
        }

        private static string[] Slice(string[] arr, int start)
        {
            if (arr == null) return new string[0];
            if (start >= arr.Length) return new string[0];
            int len = arr.Length - start;
            var r = new string[len];
            Array.Copy(arr, start, r, 0, len);
            return r;
        }
    }

    internal sealed class ParsedCommand
    {
        public CommandKind Kind { get; private set; }

        public ParseOptions ParseOptions { get; private set; }
        public PackageCommandOptions PackageOptions { get; private set; }

        private ParsedCommand() { }

        public static ParsedCommand Help()
        {
            return new ParsedCommand { Kind = CommandKind.Help };
        }

        public static ParsedCommand Parse(ParseOptions opt)
        {
            return new ParsedCommand { Kind = CommandKind.Parse, ParseOptions = opt };
        }

        public static ParsedCommand Package(PackageCommandOptions opt)
        {
            return new ParsedCommand { Kind = CommandKind.Package, PackageOptions = opt };
        }
    }

}
