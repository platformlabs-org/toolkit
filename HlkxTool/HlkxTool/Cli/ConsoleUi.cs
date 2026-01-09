using System;
using System.Collections.Generic;

namespace HlkxTool.Cli
{
    internal static class ConsoleUi
    {
        public static string Prompt(string label, string defaultValue, bool required)
        {
            while (true)
            {
                if (!string.IsNullOrWhiteSpace(defaultValue))
                    Console.Write(label + " [" + defaultValue + "] > ");
                else
                    Console.Write(label + " > ");

                string s = (Console.ReadLine() ?? "").Trim().Trim('"');

                if (s.Length == 0 && !string.IsNullOrWhiteSpace(defaultValue))
                    return defaultValue;

                if (!required && s.Length == 0)
                    return "";

                if (!string.IsNullOrWhiteSpace(s))
                    return s;

                Core.Log.Warn("Input", "输入为空，请重试。");
            }
        }

        public static bool Confirm(string prompt, bool defaultYes)
        {
            Console.Write(prompt + " (" + (defaultYes ? "Y/n" : "y/N") + ") > ");
            string ans = (Console.ReadLine() ?? "").Trim();
            if (ans.Length == 0) return defaultYes;

            return ans.Equals("y", StringComparison.OrdinalIgnoreCase) ||
                   ans.Equals("yes", StringComparison.OrdinalIgnoreCase);
        }

        public static T SelectOne<T>(string title, IList<Tuple<string, T>> items, int defaultIndex)
        {
            if (items == null || items.Count == 0)
                throw new ArgumentException("items 不能为空");

            int idx = Clamp(defaultIndex, 0, items.Count - 1);

            if (Console.IsInputRedirected || Console.IsOutputRedirected)
                return SelectOneByNumber(title, items, idx);

            bool oldCursorVisible = Console.CursorVisible;
            try
            {
                Console.CursorVisible = false;

                while (true)
                {
                    SafeClear();

                    Console.WriteLine(title);
                    Console.WriteLine("↑↓ 选择，Space/Enter 确认（也可按数字 1..N 直接选择）\n");

                    for (int i = 0; i < items.Count; i++)
                    {
                        string prefix = (i == idx) ? "➤ " : "  ";
                        string line = prefix + items[i].Item1;
                        WriteLineSafeTruncate(line, i == idx);
                    }

                    Console.WriteLine();

                    ConsoleKeyInfo key;
                    try
                    {
                        key = Console.ReadKey(intercept: true);
                    }
                    catch
                    {
                        SafeClear();
                        return SelectOneByNumber(title, items, idx);
                    }

                    if (key.KeyChar >= '1' && key.KeyChar <= '9')
                    {
                        int n = key.KeyChar - '1';
                        if (n >= 0 && n < items.Count)
                            return items[n].Item2;
                    }

                    if (key.Key == ConsoleKey.UpArrow)
                    {
                        idx = (idx - 1 + items.Count) % items.Count;
                        continue;
                    }
                    if (key.Key == ConsoleKey.DownArrow)
                    {
                        idx = (idx + 1) % items.Count;
                        continue;
                    }
                    if (key.Key == ConsoleKey.Enter || key.Key == ConsoleKey.Spacebar)
                    {
                        SafeClear();
                        return items[idx].Item2;
                    }
                }
            }
            finally
            {
                Console.CursorVisible = oldCursorVisible;
            }
        }

        private static T SelectOneByNumber<T>(string title, IList<Tuple<string, T>> items, int defaultIndex)
        {
            Console.WriteLine(title);
            for (int i = 0; i < items.Count; i++)
            {
                string mark = (i == defaultIndex) ? "*" : " ";
                Console.WriteLine("  " + mark + " " + (i + 1) + ". " + items[i].Item1);
            }

            while (true)
            {
                Console.Write("请输入序号 [默认 " + (defaultIndex + 1) + "] > ");
                string s = (Console.ReadLine() ?? "").Trim();

                if (s.Length == 0)
                    return items[defaultIndex].Item2;

                int n;
                if (int.TryParse(s, out n))
                {
                    n -= 1;
                    if (n >= 0 && n < items.Count)
                        return items[n].Item2;
                }

                Core.Log.Warn("Input", "输入无效，请输入 1..N。");
            }
        }

        private static void SafeClear()
        {
            try { Console.Clear(); } catch { }
        }

        private static void WriteLineSafeTruncate(string text, bool selected)
        {
            string line = text ?? "";

            int width;
            try { width = Console.WindowWidth; } catch { width = 0; }

            if (width > 4 && line.Length >= width)
                line = line.Substring(0, Math.Max(0, width - 1));

            if (selected)
            {
                var old = Console.ForegroundColor;
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine(line);
                Console.ForegroundColor = old;
            }
            else
            {
                Console.WriteLine(line);
            }
        }

        private static int Clamp(int v, int min, int max)
        {
            if (v < min) return min;
            if (v > max) return max;
            return v;
        }
    }
}
