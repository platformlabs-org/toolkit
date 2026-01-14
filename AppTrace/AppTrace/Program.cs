using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace AppTrace
{
    internal static class Program
    {
        private static readonly TimeSpan DefaultDuration = TimeSpan.FromSeconds(60);
        private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(200);
        private const int MaxEventBuffer = 5000;

        private static readonly string[] AsciiArt =
        {
            "   _____              ___________                           ",
            "  /  _  \\ ______ _____\\__    ___/___________    ____  ____  ",
            " /  /_\\  \\\\____ \\\\____ \\|    |  \\_  __ \\__  \\ _/ ___\\/ __ \\ ",
            "/    |    \\  |_> >  |_> >    |   |  | \\// __ \\\\  \\__\\  ___/ ",
            "\\____|__  /   __/|   __/|____|   |__|  (____  /\\___  >___  >",
            "        \\/|__|   |__|                       \\/     \\/    \\/ "
        };

        private const string Email = "i@terry.ee";

        private static int Main(string[] args)
        {
            try
            {
                RunAsync(args).GetAwaiter().GetResult();
                return 0;
            }
            catch (Exception ex)
            {
                SafeResetColor();
                Console.WriteLine("未处理异常：");
                Console.WriteLine(ex);
                return 1;
            }
        }

        private static async Task RunAsync(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            // 固定 Header（不随窗口宽度变化）
            var header = HeaderBox.Build(
                asciiLines: AsciiArt,
                email: Email,
                innerPadding: 2,
                borderStyle: BorderStyle.PlusCorners // +----+
            );

            // 程序启动立刻显示 Header
            header.PrintColored();
            Console.WriteLine();

            ParseArgs(args, out string appPath, out TimeSpan duration, out bool csvEnabled, out string csvPath);

            if (string.IsNullOrWhiteSpace(appPath))
            {
                Console.Write("请输入要启动的程序（例如 notepad 或 C:\\Windows\\System32\\notepad.exe）：");
                appPath = Console.ReadLine();
            }

            if (string.IsNullOrWhiteSpace(appPath))
            {
                Console.WriteLine("未提供启动程序路径，退出。");
                return;
            }

            CsvLogger csv = null;
            if (csvEnabled)
            {
                if (string.IsNullOrWhiteSpace(csvPath))
                {
                    string ts = DateTime.Now.ToString("yyyyMMdd_HHmmss", CultureInfo.InvariantCulture);
                    csvPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, $"AppTrace_{ts}.csv");
                }
                csv = new CsvLogger(csvPath);
                csv.WriteHeader();
            }

            try
            {
                var sw = Stopwatch.StartNew();
                StartProcessBestEffort(appPath.Trim());

                var renderer = new ConsoleRenderer(header);
                var events = new RingBuffer<EventRecord>(MaxEventBuffer);

                string infoLine = csvEnabled
                    ? $"监控：{duration.TotalSeconds:0}s / {PollInterval.TotalMilliseconds:0}ms | CSV: {Path.GetFileName(csvPath)}"
                    : $"监控：{duration.TotalSeconds:0}s / {PollInterval.TotalMilliseconds:0}ms";

                var prev = WindowSnapshot.Capture(ignoreEmptyTitle: true);

                renderer.Redraw(infoLine, events);
                int lastW = renderer.TryGetWindowWidth();

                using (var cts = new CancellationTokenSource(duration))
                {
                    while (!cts.IsCancellationRequested)
                    {
                        await Task.Delay(PollInterval, cts.Token).ConfigureAwait(false);

                        int curW = renderer.TryGetWindowWidth();
                        if (curW != lastW)
                        {
                            lastW = curW;
                            renderer.Redraw(infoLine, events);
                        }

                        var cur = WindowSnapshot.Capture(ignoreEmptyTitle: true);
                        var diff = WindowDiff.Compute(prev, cur);

                        foreach (var w in diff.Added)
                        {
                            var rec = EventRecord.Add(sw.Elapsed, w);
                            events.Add(rec);
                            renderer.PrintEvent(rec);
                            csv?.Write(rec);
                        }

                        foreach (var w in diff.Removed)
                        {
                            var rec = EventRecord.Del(sw.Elapsed, w);
                            events.Add(rec);
                            renderer.PrintEvent(rec);
                            csv?.Write(rec);
                        }

                        foreach (var change in diff.TitleChanged)
                        {
                            var rec = EventRecord.Chg(sw.Elapsed, change.NewInfo, change.OldInfo.Title, change.NewInfo.Title);
                            events.Add(rec);
                            renderer.PrintEvent(rec);
                            csv?.Write(rec);
                        }

                        prev = cur;
                    }
                }

                renderer.Redraw(
                    csvEnabled
                        ? $"监控结束（{duration.TotalSeconds:0}s）。CSV：{csvPath}"
                        : $"监控结束（{duration.TotalSeconds:0}s）。",
                    events);
            }
            finally
            {
                csv?.Dispose();
                SafeResetColor();
            }
        }

        private static void ParseArgs(string[] args,
            out string appPath,
            out TimeSpan duration,
            out bool csvEnabled,
            out string csvPath)
        {
            appPath = null;
            duration = DefaultDuration;
            csvEnabled = false;
            csvPath = null;

            if (args == null || args.Length == 0) return;

            foreach (var a in args)
            {
                if (string.IsNullOrWhiteSpace(a)) continue;

                // app
                if (a.StartsWith("--app=", StringComparison.OrdinalIgnoreCase))
                    appPath = a.Substring("--app=".Length).Trim('"');
                else if (a.StartsWith("/app=", StringComparison.OrdinalIgnoreCase))
                    appPath = a.Substring("/app=".Length).Trim('"');

                // duration
                else if (a.StartsWith("--duration=", StringComparison.OrdinalIgnoreCase))
                    duration = ParseDurationBestEffort(a.Substring("--duration=".Length));
                else if (a.StartsWith("/duration=", StringComparison.OrdinalIgnoreCase))
                    duration = ParseDurationBestEffort(a.Substring("/duration=".Length));
                else if (a.StartsWith("-t=", StringComparison.OrdinalIgnoreCase))
                    duration = ParseDurationBestEffort(a.Substring("-t=".Length));

                // csv (默认不启用：只有显式指定才启用)
                else if (string.Equals(a, "--csv", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(a, "/csv", StringComparison.OrdinalIgnoreCase))
                {
                    csvEnabled = true;
                }
                else if (a.StartsWith("--csv=", StringComparison.OrdinalIgnoreCase))
                {
                    csvEnabled = true;
                    csvPath = a.Substring("--csv=".Length).Trim('"');
                }
                else if (a.StartsWith("/csv=", StringComparison.OrdinalIgnoreCase))
                {
                    csvEnabled = true;
                    csvPath = a.Substring("/csv=".Length).Trim('"');
                }
            }

            // 位置参数：AppTrace.exe <appPath> [duration]
            var positional = new List<string>();
            foreach (var a in args)
            {
                if (string.IsNullOrWhiteSpace(a)) continue;
                if (a.StartsWith("-", StringComparison.OrdinalIgnoreCase) || a.StartsWith("/", StringComparison.OrdinalIgnoreCase))
                    continue;
                positional.Add(a);
            }

            if (string.IsNullOrWhiteSpace(appPath) && positional.Count >= 1)
                appPath = positional[0].Trim('"');

            if (positional.Count >= 2)
                duration = ParseDurationBestEffort(positional[1]);
        }

        private static TimeSpan ParseDurationBestEffort(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return DefaultDuration;
            s = s.Trim().Trim('"');

            if (TimeSpan.TryParse(s, CultureInfo.InvariantCulture, out var ts))
                return ts.TotalMilliseconds <= 0 ? DefaultDuration : ts;

            if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out int sec) && sec > 0)
                return TimeSpan.FromSeconds(sec);

            var lower = s.ToLowerInvariant();

            if (lower.EndsWith("ms") && double.TryParse(lower.Substring(0, lower.Length - 2), NumberStyles.Float, CultureInfo.InvariantCulture, out double ms) && ms > 0)
                return TimeSpan.FromMilliseconds(ms);

            if (lower.EndsWith("s") && double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out double sVal) && sVal > 0)
                return TimeSpan.FromSeconds(sVal);

            if (lower.EndsWith("m") && double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out double mVal) && mVal > 0)
                return TimeSpan.FromMinutes(mVal);

            if (lower.EndsWith("h") && double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out double hVal) && hVal > 0)
                return TimeSpan.FromHours(hVal);

            return DefaultDuration;
        }

        private static void StartProcessBestEffort(string commandOrPath)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = commandOrPath,
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                SafeResetColor();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"WARN: 启动失败：{ex.Message}");
                SafeResetColor();
            }
        }

        private static void SafeResetColor()
        {
            try { Console.ResetColor(); } catch { /* ignore */ }
        }
    }

    // ===================== Header（固定样式 + 彩色输出） =====================

    internal enum BorderStyle
    {
        Pipes,       // |----|
        PlusCorners  // +----+
    }

    internal sealed class HeaderBox
    {
        public string[] ArtLines { get; private set; }
        public string Email { get; private set; }
        public int InnerWidth { get; private set; }
        public int InnerPadding { get; private set; }
        public BorderStyle BorderStyle { get; private set; }

        public static HeaderBox Build(string[] asciiLines, string email, int innerPadding, BorderStyle borderStyle)
        {
            asciiLines = asciiLines ?? Array.Empty<string>();
            email = email ?? string.Empty;
            innerPadding = Math.Max(0, innerPadding);

            int artWidth = 0;
            foreach (var line in asciiLines)
                artWidth = Math.Max(artWidth, TextWidth.GetDisplayWidth(line ?? ""));

            int emailWidth = TextWidth.GetDisplayWidth(email);
            int innerWidth = Math.Max(artWidth, emailWidth) + innerPadding * 2;

            return new HeaderBox
            {
                ArtLines = asciiLines,
                Email = email,
                InnerPadding = innerPadding,
                InnerWidth = innerWidth,
                BorderStyle = borderStyle
            };
        }

        public void PrintColored()
        {
            // 边框颜色 / 内容颜色
            var borderColor = ConsoleColor.DarkGray;
            var artColor = ConsoleColor.Cyan;
            var emailColor = ConsoleColor.Yellow;

            char tl, tr, bl, br, h, v;
            if (BorderStyle == BorderStyle.PlusCorners)
            {
                tl = tr = bl = br = '+';
                h = '-';
                v = '|';
            }
            else
            {
                tl = tr = bl = br = '|';
                h = '-';
                v = '|';
            }

            // top
            WriteBorderLine(tl, h, tr, borderColor);

            // art lines centered inside
            foreach (var raw in ArtLines)
            {
                string s = raw ?? "";
                int w = TextWidth.GetDisplayWidth(s);
                int left = Math.Max(0, (InnerWidth - w) / 2);
                int right = Math.Max(0, InnerWidth - w - left);

                WriteFramedLine(
                    leftSpaces: left,
                    content: s,
                    rightSpaces: right,
                    contentColor: artColor,
                    borderColor: borderColor,
                    v: v);
            }

            // blank line
            WriteFramedLine(InnerWidth, "", 0, contentColor: ConsoleColor.Gray, borderColor: borderColor, v: v);

            // email at right-bottom (right aligned inside)
            int emailW = TextWidth.GetDisplayWidth(Email);
            int emailLeft = Math.Max(0, InnerWidth - emailW);
            int emailRight = Math.Max(0, InnerWidth - emailLeft - emailW);

            // left spaces (gray), email (yellow), right spaces (gray)
            WriteBorderChar(v, borderColor);
            WriteSpaces(emailLeft, ConsoleColor.Gray);
            WriteText(Email, emailColor);
            WriteSpaces(emailRight, ConsoleColor.Gray);
            WriteBorderChar(v, borderColor);
            Console.WriteLine();

            // bottom
            WriteBorderLine(bl, h, br, borderColor);

            SafeResetColor();
        }

        private void WriteBorderLine(char leftCorner, char horiz, char rightCorner, ConsoleColor borderColor)
        {
            WriteBorderChar(leftCorner, borderColor);
            WriteBorderText(new string(horiz, InnerWidth), borderColor);
            WriteBorderChar(rightCorner, borderColor);
            Console.WriteLine();
        }

        private void WriteFramedLine(int leftSpaces, string content, int rightSpaces,
            ConsoleColor contentColor, ConsoleColor borderColor, char v)
        {
            WriteBorderChar(v, borderColor);

            // 左空格
            WriteSpaces(leftSpaces, ConsoleColor.Gray);

            // 内容
            if (!string.IsNullOrEmpty(content))
                WriteText(content, contentColor);

            // 右空格
            WriteSpaces(rightSpaces, ConsoleColor.Gray);

            WriteBorderChar(v, borderColor);
            Console.WriteLine();
        }

        private static void WriteBorderChar(char c, ConsoleColor color)
        {
            var old = Console.ForegroundColor;
            Console.ForegroundColor = color;
            Console.Write(c);
            Console.ForegroundColor = old;
        }

        private static void WriteBorderText(string s, ConsoleColor color)
        {
            var old = Console.ForegroundColor;
            Console.ForegroundColor = color;
            Console.Write(s);
            Console.ForegroundColor = old;
        }

        private static void WriteText(string s, ConsoleColor color)
        {
            var old = Console.ForegroundColor;
            Console.ForegroundColor = color;
            Console.Write(s);
            Console.ForegroundColor = old;
        }

        private static void WriteSpaces(int count, ConsoleColor color)
        {
            if (count <= 0) return;
            var old = Console.ForegroundColor;
            Console.ForegroundColor = color;
            Console.Write(new string(' ', count));
            Console.ForegroundColor = old;
        }

        private static void SafeResetColor()
        {
            try { Console.ResetColor(); } catch { /* ignore */ }
        }
    }

    // ===================== CSV（仅在用户启用时写入） =====================

    internal sealed class CsvLogger : IDisposable
    {
        private readonly StreamWriter _w;

        public CsvLogger(string path)
        {
            var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read);
            _w = new StreamWriter(fs, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true))
            {
                AutoFlush = true
            };
        }

        public void WriteHeader()
        {
            _w.WriteLine("local_time,elapsed_ms,event,pid,process,hwnd,title,old_title,new_title");
        }

        public void Write(EventRecord r)
        {
            string localTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);
            long elapsedMs = (long)r.SinceStart.TotalMilliseconds;

            string evt = r.Type.ToString();
            string pid = r.Info.Pid.ToString(CultureInfo.InvariantCulture);
            string proc = r.Info.ProcessName ?? "";
            string hwnd = "0x" + r.Info.Hwnd.ToInt64().ToString("X8", CultureInfo.InvariantCulture);

            string title = "";
            string oldTitle = "";
            string newTitle = "";

            if (r.Type == EventType.CHG)
            {
                oldTitle = TextWidth.Normalize(r.OldTitle);
                newTitle = TextWidth.Normalize(r.NewTitle);
            }
            else
            {
                title = TextWidth.Normalize(r.Info.Title);
            }

            _w.WriteLine(string.Join(",",
                Csv(localTime),
                elapsedMs.ToString(CultureInfo.InvariantCulture),
                Csv(evt),
                pid,
                Csv(proc),
                Csv(hwnd),
                Csv(title),
                Csv(oldTitle),
                Csv(newTitle)
            ));
        }

        private static string Csv(string s)
        {
            s = s ?? "";
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }

        public void Dispose()
        {
            try { _w?.Dispose(); } catch { /* ignore */ }
        }
    }

    // ===================== 控制台渲染：Resize 重绘 + 自适应列宽 =====================

    internal sealed class ConsoleRenderer
    {
        private readonly HeaderBox _header;
        private Layout _layout;
        private int _lastWidth;

        public ConsoleRenderer(HeaderBox header)
        {
            _header = header;
            _lastWidth = TryGetWindowWidth();
            _layout = Layout.Compute(_lastWidth);
        }

        public int TryGetWindowWidth()
        {
            try { return Math.Max(20, Console.WindowWidth - 1); }
            catch { return 120; }
        }

        public void Redraw(string infoLine, RingBuffer<EventRecord> events)
        {
            int w = TryGetWindowWidth();
            _lastWidth = w;
            _layout = Layout.Compute(w);

            try { Console.Clear(); } catch { /* ignore */ }

            int linesWritten = 0;

            // Header 固定、彩色
            _header.PrintColored();
            linesWritten += (AsciiLineCountEstimate(_header) + 2); // 估算，不影响功能

            Console.WriteLine();
            linesWritten++;

            Console.WriteLine(TextWidth.TruncateToDisplayWidth(infoLine ?? "", w));
            linesWritten++;

            Console.WriteLine();
            linesWritten++;

            string headerRow = _layout.BuildHeader();
            Console.WriteLine(headerRow);
            Console.WriteLine(new string('-', Math.Min(w, headerRow.Length)));
            linesWritten += 2;

            int h;
            try { h = Console.WindowHeight; }
            catch { h = 30; }

            int availableLines = Math.Max(1, h - linesWritten - 1);

            var list = events.ToList();
            int start = Math.Max(0, list.Count - availableLines);
            for (int i = start; i < list.Count; i++)
                PrintEvent(list[i]);
        }

        public void PrintEvent(EventRecord rec)
        {
            int w = TryGetWindowWidth();
            if (w != _lastWidth)
            {
                _lastWidth = w;
                _layout = Layout.Compute(w);
            }

            var old = Console.ForegroundColor;

            if (rec.Type == EventType.ADD) Console.ForegroundColor = ConsoleColor.Green;
            else if (rec.Type == EventType.DEL) Console.ForegroundColor = ConsoleColor.DarkYellow;
            else Console.ForegroundColor = ConsoleColor.Cyan;

            Console.WriteLine(_layout.Format(rec));

            Console.ForegroundColor = old;
        }

        private static int AsciiLineCountEstimate(HeaderBox header)
        {
            // 上下边框 + art行数 + 空行 + email行
            // 这里只用于 linesWritten 估算（不影响输出），避免依赖内部字段
            // 直接按固定结构估算：
            return 2 + 6 + 1 + 1;
        }
    }

    internal enum EventType { ADD, DEL, CHG }

    internal sealed class EventRecord
    {
        public EventType Type { get; private set; }
        public TimeSpan SinceStart { get; private set; }
        public WindowInfo Info { get; private set; }

        public string OldTitle { get; private set; }
        public string NewTitle { get; private set; }

        public static EventRecord Add(TimeSpan ts, WindowInfo w) =>
            new EventRecord { Type = EventType.ADD, SinceStart = ts, Info = w };

        public static EventRecord Del(TimeSpan ts, WindowInfo w) =>
            new EventRecord { Type = EventType.DEL, SinceStart = ts, Info = w };

        public static EventRecord Chg(TimeSpan ts, WindowInfo w, string oldTitle, string newTitle) =>
            new EventRecord { Type = EventType.CHG, SinceStart = ts, Info = w, OldTitle = oldTitle ?? "", NewTitle = newTitle ?? "" };
    }

    internal sealed class Layout
    {
        private readonly bool _showPid;
        private readonly bool _showProcess;
        private readonly bool _showHwnd;

        private readonly int _wTime;
        private readonly int _wEvt;
        private readonly int _wPid;
        private readonly int _wProc;
        private readonly int _wHwnd;
        private readonly int _wTitle;

        private Layout(bool showPid, bool showProcess, bool showHwnd,
            int wTime, int wEvt, int wPid, int wProc, int wHwnd, int wTitle)
        {
            _showPid = showPid;
            _showProcess = showProcess;
            _showHwnd = showHwnd;

            _wTime = wTime;
            _wEvt = wEvt;
            _wPid = wPid;
            _wProc = wProc;
            _wHwnd = wHwnd;
            _wTitle = wTitle;
        }

        public static Layout Compute(int windowWidth)
        {
            const int wTime = 10;
            const int wEvt = 3;
            const int sep = 2;

            const int pidMin = 5, pidMax = 6;
            const int procMin = 10, procMax = 22;
            const int hwndMin = 10, hwndMax = 12;
            const int titleMin = 12;

            bool showPid = windowWidth >= 45;
            bool showProcess = windowWidth >= 65;
            bool showHwnd = windowWidth >= 80;

            int colCount = 3 + (showPid ? 1 : 0) + (showProcess ? 1 : 0) + (showHwnd ? 1 : 0);
            int totalSep = sep * (colCount - 1);

            int available = Math.Max(10, windowWidth - totalSep);

            int wPid = showPid ? pidMin : 0;
            int wProc = showProcess ? procMin : 0;
            int wHwnd = showHwnd ? hwndMin : 0;

            int wTitle = titleMin;

            int used = wTime + wEvt + wTitle + wPid + wProc + wHwnd;
            int extra = available - used;

            if (extra > 0 && showProcess)
            {
                int add = Math.Min(extra, procMax - wProc);
                wProc += add; extra -= add;
            }
            if (extra > 0 && showHwnd)
            {
                int add = Math.Min(extra, hwndMax - wHwnd);
                wHwnd += add; extra -= add;
            }
            if (extra > 0 && showPid)
            {
                int add = Math.Min(extra, pidMax - wPid);
                wPid += add; extra -= add;
            }
            if (extra > 0)
            {
                wTitle += extra;
                extra = 0;
            }

            return new Layout(showPid, showProcess, showHwnd, wTime, wEvt, wPid, wProc, wHwnd, wTitle);
        }

        public string BuildHeader()
        {
            var parts = new List<string>
            {
                TextWidth.PadRightDisplay("TIME", _wTime),
                TextWidth.PadRightDisplay("EVT", _wEvt),
            };

            if (_showPid) parts.Add(TextWidth.PadRightDisplay("PID", _wPid));
            if (_showProcess) parts.Add(TextWidth.PadRightDisplay("PROCESS", _wProc));
            if (_showHwnd) parts.Add(TextWidth.PadRightDisplay("HWND", _wHwnd));

            parts.Add(TextWidth.PadRightDisplay("TITLE", _wTitle));
            return string.Join("  ", parts);
        }

        public string Format(EventRecord rec)
        {
            string ts = rec.SinceStart.ToString(@"mm\:ss\.fff", CultureInfo.InvariantCulture);
            string evt = rec.Type.ToString();

            string pid = rec.Info.Pid >= 0 ? rec.Info.Pid.ToString(CultureInfo.InvariantCulture) : "-";
            string proc = string.IsNullOrWhiteSpace(rec.Info.ProcessName) ? "Unknown" : rec.Info.ProcessName;
            string hwnd = $"0x{rec.Info.Hwnd.ToInt64():X8}";

            string title;
            if (rec.Type == EventType.CHG)
            {
                var oldT = TextWidth.Normalize(rec.OldTitle);
                var newT = TextWidth.Normalize(rec.NewTitle);
                title = $"{oldT} -> {newT}";
            }
            else
            {
                title = TextWidth.Normalize(rec.Info.Title);
            }

            var parts = new List<string>
            {
                TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(ts, _wTime), _wTime),
                TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(evt, _wEvt), _wEvt),
            };

            if (_showPid)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(pid, _wPid), _wPid));
            if (_showProcess)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(proc, _wProc), _wProc));
            if (_showHwnd)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(hwnd, _wHwnd), _wHwnd));

            parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(title, _wTitle), _wTitle));
            return string.Join("  ", parts);
        }
    }

    internal static class TextWidth
    {
        public static string Normalize(string s)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;

            var sb = new StringBuilder(s.Length);
            bool lastSpace = false;

            foreach (var ch in s)
            {
                char c = ch;
                if (c == '\r' || c == '\n' || c == '\t') c = ' ';

                if (char.IsWhiteSpace(c))
                {
                    if (!lastSpace)
                    {
                        sb.Append(' ');
                        lastSpace = true;
                    }
                }
                else
                {
                    sb.Append(c);
                    lastSpace = false;
                }
            }

            return sb.ToString().Trim();
        }

        // ASCII=1，非ASCII≈2（更适合中英文混排）
        public static int GetDisplayWidth(string s)
        {
            if (string.IsNullOrEmpty(s)) return 0;
            int w = 0;
            foreach (var ch in s) w += (ch <= 0xFF) ? 1 : 2;
            return w;
        }

        public static string TruncateToDisplayWidth(string s, int maxWidth)
        {
            if (string.IsNullOrEmpty(s) || maxWidth <= 0) return string.Empty;

            int w = 0;
            var sb = new StringBuilder(s.Length);

            for (int i = 0; i < s.Length; i++)
            {
                char ch = s[i];
                int cw = (ch <= 0xFF) ? 1 : 2;

                if (w + cw > maxWidth)
                {
                    const string ell = "…";
                    int ellW = 2;

                    if (maxWidth >= ellW)
                    {
                        while (sb.Length > 0 && GetDisplayWidth(sb.ToString()) + ellW > maxWidth)
                            sb.Length--;
                        sb.Append(ell);
                    }
                    return sb.ToString();
                }

                sb.Append(ch);
                w += cw;
            }

            return sb.ToString();
        }

        public static string PadRightDisplay(string s, int width)
        {
            s = s ?? string.Empty;
            int w = GetDisplayWidth(s);
            if (w >= width) return s;
            return s + new string(' ', width - w);
        }
    }

    internal sealed class RingBuffer<T>
    {
        private readonly T[] _buf;
        private int _count;
        private int _head;

        public RingBuffer(int capacity)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            _buf = new T[capacity];
        }

        public void Add(T item)
        {
            _buf[_head] = item;
            _head = (_head + 1) % _buf.Length;
            if (_count < _buf.Length) _count++;
        }

        public List<T> ToList()
        {
            var list = new List<T>(_count);
            int start = (_head - _count + _buf.Length) % _buf.Length;

            for (int i = 0; i < _count; i++)
                list.Add(_buf[(start + i) % _buf.Length]);

            return list;
        }
    }

    // ===================== 窗口 Diff/快照 =====================

    internal sealed class WindowDiff
    {
        public List<WindowInfo> Added { get; } = new List<WindowInfo>();
        public List<WindowInfo> Removed { get; } = new List<WindowInfo>();
        public List<WindowTitleChange> TitleChanged { get; } = new List<WindowTitleChange>();

        public static WindowDiff Compute(WindowSnapshot prev, WindowSnapshot cur)
        {
            var d = new WindowDiff();

            foreach (var kv in cur.Windows)
                if (!prev.Windows.ContainsKey(kv.Key))
                    d.Added.Add(kv.Value);

            foreach (var kv in prev.Windows)
                if (!cur.Windows.ContainsKey(kv.Key))
                    d.Removed.Add(kv.Value);

            foreach (var kv in cur.Windows)
            {
                if (!prev.Windows.TryGetValue(kv.Key, out var oldInfo)) continue;
                var newInfo = kv.Value;

                if (!string.Equals(oldInfo.Title, newInfo.Title, StringComparison.Ordinal))
                    d.TitleChanged.Add(new WindowTitleChange(oldInfo, newInfo));
            }

            return d;
        }
    }

    internal sealed class WindowTitleChange
    {
        public WindowInfo OldInfo { get; }
        public WindowInfo NewInfo { get; }

        public WindowTitleChange(WindowInfo oldInfo, WindowInfo newInfo)
        {
            OldInfo = oldInfo;
            NewInfo = newInfo;
        }
    }

    internal sealed class WindowSnapshot
    {
        public Dictionary<IntPtr, WindowInfo> Windows { get; }

        private WindowSnapshot(Dictionary<IntPtr, WindowInfo> windows)
        {
            Windows = windows;
        }

        public static WindowSnapshot Capture(bool ignoreEmptyTitle)
        {
            var dict = new Dictionary<IntPtr, WindowInfo>();

            NativeMethods.EnumWindows((hWnd, lParam) =>
            {
                if (!NativeMethods.IsWindow(hWnd) || !NativeMethods.IsWindowVisible(hWnd))
                    return true;

                var title = NativeMethods.GetWindowTitle(hWnd);
                if (ignoreEmptyTitle && string.IsNullOrWhiteSpace(title))
                    return true;

                NativeMethods.GetWindowThreadProcessId(hWnd, out uint pid);
                dict[hWnd] = WindowInfo.From(hWnd, title, (int)pid);
                return true;
            }, IntPtr.Zero);

            return new WindowSnapshot(dict);
        }
    }

    internal sealed class WindowInfo
    {
        public IntPtr Hwnd { get; private set; }
        public string Title { get; private set; }
        public int Pid { get; private set; }
        public string ProcessName { get; private set; }
        public string ProcessPath { get; private set; }

        public static WindowInfo From(IntPtr hwnd, string title, int pid)
        {
            string name = "Unknown";
            string path = null;

            try
            {
                var p = Process.GetProcessById(pid);
                name = SafeProcessName(p);
                try { path = p.MainModule?.FileName; } catch { /* ignore */ }
            }
            catch { /* ignore */ }

            return new WindowInfo
            {
                Hwnd = hwnd,
                Title = title ?? string.Empty,
                Pid = pid,
                ProcessName = name,
                ProcessPath = path
            };
        }

        private static string SafeProcessName(Process p)
        {
            try
            {
                var n = p.ProcessName ?? "Unknown";
                return n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? n : (n + ".exe");
            }
            catch { return "Unknown"; }
        }
    }

    // ===================== Win32 API =====================

    internal static class NativeMethods
    {
        internal delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        internal static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        internal static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        internal static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        internal static string GetWindowTitle(IntPtr hWnd)
        {
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return string.Empty;

            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            return sb.ToString();
        }
    }
}
