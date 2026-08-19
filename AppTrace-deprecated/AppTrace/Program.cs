// AppTrace (.NET Framework 4.8 compatible, no time-limit logic)
// - Runs until user presses Ctrl+C (or console closes).
// - CSV supports stacking: run_id + RUN_START/RUN_END rows.
// Build suggestions:
//   - Use .NET Framework 4.8 project, Language Version <= C# 7.3 (this file avoids newer syntax like ??=).
//
// Usage examples:
//   AppTrace.exe --app="notepad" --csv="events.csv"
//   AppTrace.exe --app="C:\Windows\System32\notepad.exe" --csv
//   AppTrace.exe "notepad" --csv --poll=200ms
//
// Notes:
// - Removed all duration/timeout logic. (No --duration / positional duration.)
// - Stop by Ctrl+C.

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
        private static readonly string[] AsciiArt =
        {
            "   _____              ___________                           ",
            "  /  _  \\ ______ _____\\__    ___/___________    ____  ____  ",
            " /  /_\\  \\\\____ \\\\____ \\|    |  \\_  __ \\__  \\ _/ ___\\/ __ \\ ",
            "/    |    \\  |_> >  |_> >    |   |  | \\// __ \\\\  \\__\\  ___/ ",
            "\\____|__  /   __/|   __/|____|   |__|  (____  /\\___  >___  >",
            "        \\/|__|   |__|                       \\/     \\/    \\/ "
        };

        private const string Email = "liuty24@lenovo.com";

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

            var header = HeaderBox.Build(AsciiArt, Email, innerPadding: 2);
            header.PrintColored();
            Console.WriteLine();

            TraceOptions options = TraceOptions.Parse(args);

            if (string.IsNullOrWhiteSpace(options.AppPath))
            {
                Console.Write("请输入要启动的程序（例如 notepad 或 C:\\Windows\\System32\\notepad.exe）：");
                options.AppPath = Console.ReadLine();
            }

            if (string.IsNullOrWhiteSpace(options.AppPath))
            {
                Console.WriteLine("未提供启动程序路径，退出。");
                return;
            }

            RunContext ctx = RunContext.Create(options);

            CsvLogger csv = null;
            if (options.CsvEnabled)
            {
                string csvPath = options.CsvPath;
                if (string.IsNullOrWhiteSpace(csvPath))
                {
                    csvPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "AppTrace_events.csv");
                }

                csv = new CsvLogger(csvPath, ctx);
                csv.WriteHeaderIfNeeded();
                csv.WriteRunStart();
            }

            var renderer = new ConsoleRenderer(header);
            var stats = new MonitorStats();
            var events = new RingBuffer<EventRecord>(options.MaxEventBuffer);

            // Stop control: Ctrl+C
            var stopCts = new CancellationTokenSource();
            ConsoleCancelEventHandler cancelHandler = (s, e) =>
            {
                e.Cancel = true; // do not kill process immediately
                try { stopCts.Cancel(); } catch { /* ignore */ }
            };

            Console.CancelKeyPress += cancelHandler;

            // Ensure on process exit we flush RUN_END best-effort
            EventHandler processExitHandler = (s, e) =>
            {
                try { stopCts.Cancel(); } catch { /* ignore */ }
            };
            AppDomain.CurrentDomain.ProcessExit += processExitHandler;

            string infoLine = options.CsvEnabled
                ? string.Format("监控：无限期 / {0:0}ms | CSV: {1} | run_id: {2} | Ctrl+C 停止",
                    options.PollInterval.TotalMilliseconds,
                    Path.GetFileName(csv != null ? csv.Path : (options.CsvPath ?? "AppTrace_events.csv")),
                    ctx.RunId)
                : string.Format("监控：无限期 / {0:0}ms | run_id: {1} | Ctrl+C 停止",
                    options.PollInterval.TotalMilliseconds,
                    ctx.RunId);

            try
            {
                var sw = Stopwatch.StartNew();

                StartProcessBestEffort(options.AppPath.Trim());

                WindowSnapshot prev = WindowSnapshot.Capture(ignoreEmptyTitle: true);

                renderer.Redraw(infoLine, events);
                int lastW = renderer.TryGetWindowWidth();

                while (!stopCts.IsCancellationRequested)
                {
                    // .NET 4.8 supports Task.Delay
                    await Task.Delay(options.PollInterval).ConfigureAwait(false);

                    int curW = renderer.TryGetWindowWidth();
                    if (curW != lastW)
                    {
                        lastW = curW;
                        renderer.Redraw(infoLine, events);
                    }

                    WindowSnapshot cur = WindowSnapshot.Capture(ignoreEmptyTitle: true);
                    WindowDiff diff = WindowDiff.Compute(prev, cur);

                    for (int i = 0; i < diff.Added.Count; i++)
                    {
                        EventRecord rec = EventRecord.Add(sw.Elapsed, diff.Added[i]);
                        ConsumeEvent(rec, events, renderer, csv, stats);
                    }

                    for (int i = 0; i < diff.Removed.Count; i++)
                    {
                        EventRecord rec = EventRecord.Del(sw.Elapsed, diff.Removed[i]);
                        ConsumeEvent(rec, events, renderer, csv, stats);
                    }

                    for (int i = 0; i < diff.TitleChanged.Count; i++)
                    {
                        WindowTitleChange change = diff.TitleChanged[i];
                        EventRecord rec = EventRecord.Chg(sw.Elapsed, change.NewInfo, change.OldInfo.Title, change.NewInfo.Title);
                        ConsumeEvent(rec, events, renderer, csv, stats);
                    }

                    prev = cur;
                }

                renderer.Redraw(
                    options.CsvEnabled
                        ? string.Format("监控结束。CSV：{0}", (csv != null ? csv.Path : ""))
                        : "监控结束。",
                    events);

                if (csv != null)
                    csv.WriteRunEnd(sw.Elapsed, stats);
            }
            finally
            {
                // Unhook handlers
                try { Console.CancelKeyPress -= cancelHandler; } catch { /* ignore */ }
                try { AppDomain.CurrentDomain.ProcessExit -= processExitHandler; } catch { /* ignore */ }

                if (csv != null) csv.Dispose();
                SafeResetColor();
            }
        }

        private static void ConsumeEvent(
            EventRecord rec,
            RingBuffer<EventRecord> buffer,
            ConsoleRenderer renderer,
            CsvLogger csv,
            MonitorStats stats)
        {
            buffer.Add(rec);
            renderer.PrintEvent(rec);

            stats.TotalEvents++;
            if (rec.Type == EventType.ADD) stats.Added++;
            else if (rec.Type == EventType.DEL) stats.Removed++;
            else if (rec.Type == EventType.CHG) stats.Changed++;

            if (csv != null) csv.WriteEvent(rec);
        }

        private static void StartProcessBestEffort(string commandOrPath)
        {
            try
            {
                var psi = new ProcessStartInfo();
                psi.FileName = commandOrPath;
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch (Exception ex)
            {
                SafeResetColor();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("WARN: 启动失败：" + ex.Message);
                SafeResetColor();
            }
        }

        private static void SafeResetColor()
        {
            try { Console.ResetColor(); } catch { /* ignore */ }
        }
    }

    // ===================== Options / RunContext / Stats =====================

    internal sealed class TraceOptions
    {
        public TimeSpan PollInterval { get; set; }
        public int MaxEventBuffer { get; set; }

        public string AppPath { get; set; }
        public bool CsvEnabled { get; set; }
        public string CsvPath { get; set; }

        public string[] RawArgs { get; set; }

        public TraceOptions()
        {
            PollInterval = TimeSpan.FromMilliseconds(200);
            MaxEventBuffer = 5000;
            RawArgs = new string[0];
        }

        public static TraceOptions Parse(string[] args)
        {
            var opt = new TraceOptions();
            opt.RawArgs = args ?? new string[0];

            if (args == null || args.Length == 0) return opt;

            foreach (var a0 in args)
            {
                string a = (a0 ?? "").Trim();
                if (string.IsNullOrWhiteSpace(a)) continue;

                // app
                if (a.StartsWith("--app=", StringComparison.OrdinalIgnoreCase))
                    opt.AppPath = TrimQuotes(a.Substring("--app=".Length));
                else if (a.StartsWith("/app=", StringComparison.OrdinalIgnoreCase))
                    opt.AppPath = TrimQuotes(a.Substring("/app=".Length));

                // poll interval
                else if (a.StartsWith("--poll=", StringComparison.OrdinalIgnoreCase))
                    opt.PollInterval = ParseDurationBestEffort(a.Substring("--poll=".Length), opt.PollInterval);
                else if (a.StartsWith("/poll=", StringComparison.OrdinalIgnoreCase))
                    opt.PollInterval = ParseDurationBestEffort(a.Substring("/poll=".Length), opt.PollInterval);

                // csv
                else if (string.Equals(a, "--csv", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(a, "/csv", StringComparison.OrdinalIgnoreCase))
                {
                    opt.CsvEnabled = true;
                }
                else if (a.StartsWith("--csv=", StringComparison.OrdinalIgnoreCase))
                {
                    opt.CsvEnabled = true;
                    opt.CsvPath = TrimQuotes(a.Substring("--csv=".Length));
                }
                else if (a.StartsWith("/csv=", StringComparison.OrdinalIgnoreCase))
                {
                    opt.CsvEnabled = true;
                    opt.CsvPath = TrimQuotes(a.Substring("/csv=".Length));
                }

                // buffer
                else if (a.StartsWith("--buf=", StringComparison.OrdinalIgnoreCase))
                {
                    int b;
                    if (int.TryParse(a.Substring("--buf=".Length), NumberStyles.Integer, CultureInfo.InvariantCulture, out b) && b > 0)
                        opt.MaxEventBuffer = b;
                }
            }

            // positional: AppTrace.exe <appPath>
            var positional = new List<string>();
            foreach (var a0 in args)
            {
                string a = (a0 ?? "").Trim();
                if (string.IsNullOrWhiteSpace(a)) continue;
                if (a.StartsWith("-", StringComparison.OrdinalIgnoreCase) || a.StartsWith("/", StringComparison.OrdinalIgnoreCase))
                    continue;
                positional.Add(a);
            }

            if (string.IsNullOrWhiteSpace(opt.AppPath) && positional.Count >= 1)
                opt.AppPath = TrimQuotes(positional[0]);

            if (opt.PollInterval.TotalMilliseconds <= 0)
                opt.PollInterval = TimeSpan.FromMilliseconds(200);

            return opt;
        }

        private static string TrimQuotes(string s)
        {
            if (s == null) return null;
            return s.Trim().Trim('"');
        }

        // Accept: "00:00:00.200", "200", "200ms", "0.2s", "2m", "1h"
        private static TimeSpan ParseDurationBestEffort(string s, TimeSpan fallback)
        {
            if (string.IsNullOrWhiteSpace(s)) return fallback;
            s = s.Trim().Trim('"');

            TimeSpan ts;
            if (TimeSpan.TryParse(s, CultureInfo.InvariantCulture, out ts))
                return ts.TotalMilliseconds <= 0 ? fallback : ts;

            int sec;
            if (int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out sec) && sec > 0)
                return TimeSpan.FromSeconds(sec);

            string lower = s.ToLowerInvariant();

            double ms;
            if (lower.EndsWith("ms") &&
                double.TryParse(lower.Substring(0, lower.Length - 2), NumberStyles.Float, CultureInfo.InvariantCulture, out ms) && ms > 0)
                return TimeSpan.FromMilliseconds(ms);

            double sVal;
            if (lower.EndsWith("s") &&
                double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out sVal) && sVal > 0)
                return TimeSpan.FromSeconds(sVal);

            double mVal;
            if (lower.EndsWith("m") &&
                double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out mVal) && mVal > 0)
                return TimeSpan.FromMinutes(mVal);

            double hVal;
            if (lower.EndsWith("h") &&
                double.TryParse(lower.Substring(0, lower.Length - 1), NumberStyles.Float, CultureInfo.InvariantCulture, out hVal) && hVal > 0)
                return TimeSpan.FromHours(hVal);

            return fallback;
        }
    }

    internal sealed class RunContext
    {
        public string RunId { get; private set; }
        public DateTime RunStartLocal { get; private set; }
        public DateTime RunStartUtc { get; private set; }

        public string Host { get; private set; }
        public string User { get; private set; }

        public string AppPath { get; private set; }
        public long PollMs { get; private set; }

        public string CmdLine { get; private set; }

        public static RunContext Create(TraceOptions opt)
        {
            var nowLocal = DateTime.Now;
            var nowUtc = DateTime.UtcNow;

            string cmd = "";
            try
            {
                if (opt != null && opt.RawArgs != null)
                    cmd = string.Join(" ", opt.RawArgs);
            }
            catch { /* ignore */ }

            return new RunContext
            {
                RunId = Guid.NewGuid().ToString("N"),
                RunStartLocal = nowLocal,
                RunStartUtc = nowUtc,
                Host = Environment.MachineName ?? "",
                User = Environment.UserName ?? "",
                AppPath = (opt != null ? (opt.AppPath ?? "") : ""),
                PollMs = (long)(opt != null ? opt.PollInterval.TotalMilliseconds : 0),
                CmdLine = cmd ?? ""
            };
        }
    }

    internal sealed class MonitorStats
    {
        public long TotalEvents { get; set; }
        public long Added { get; set; }
        public long Removed { get; set; }
        public long Changed { get; set; }
    }

    // ===================== Header（固定样式 + 彩色输出） =====================

    internal sealed class HeaderBox
    {
        public string[] ArtLines { get; private set; }
        public string Email { get; private set; }
        public int InnerWidth { get; private set; }
        public int InnerPadding { get; private set; }

        private const char TL = '╔';
        private const char TR = '╗';
        private const char BL = '╚';
        private const char BR = '╝';
        private const char H = '═';
        private const char V = '║';

        public static HeaderBox Build(string[] asciiLines, string email, int innerPadding)
        {
            if (asciiLines == null) asciiLines = new string[0];
            if (email == null) email = string.Empty;
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
                InnerWidth = innerWidth
            };
        }

        public void PrintColored()
        {
            var borderColor = ConsoleColor.DarkGray;
            var artColor = ConsoleColor.Cyan;
            var emailColor = ConsoleColor.Yellow;
            var paddingColor = ConsoleColor.Gray;

            WriteBorderLine(TL, H, TR, borderColor);

            foreach (var raw in ArtLines)
            {
                string s = raw ?? "";
                int w = TextWidth.GetDisplayWidth(s);
                int left = Math.Max(0, (InnerWidth - w) / 2);
                int right = Math.Max(0, InnerWidth - w - left);

                WriteFramedLine(left, s, right, artColor, borderColor, paddingColor);
            }

            WriteFramedLine(InnerWidth, "", 0, paddingColor, borderColor, paddingColor);

            int emailW = TextWidth.GetDisplayWidth(Email);
            int leftPad = Math.Max(0, InnerWidth - emailW);
            int rightPad = Math.Max(0, InnerWidth - leftPad - emailW);

            WriteBorderChar(V, borderColor);
            WriteSpaces(leftPad, paddingColor);
            WriteText(Email, emailColor);
            WriteSpaces(rightPad, paddingColor);
            WriteBorderChar(V, borderColor);
            Console.WriteLine();

            WriteBorderLine(BL, H, BR, borderColor);

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
            ConsoleColor contentColor, ConsoleColor borderColor, ConsoleColor paddingColor)
        {
            WriteBorderChar(V, borderColor);
            WriteSpaces(leftSpaces, paddingColor);

            if (!string.IsNullOrEmpty(content))
                WriteText(content, contentColor);

            WriteSpaces(rightSpaces, paddingColor);
            WriteBorderChar(V, borderColor);
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

    // ===================== CSV（append + run_id + RUN_START/RUN_END） =====================

    internal sealed class CsvLogger : IDisposable
    {
        private readonly StreamWriter _w;
        private readonly bool _writeHeader;
        private long _eventIdx;
        private readonly RunContext _ctx;

        public string Path { get; private set; }

        public CsvLogger(string path, RunContext ctx)
        {
            if (path == null) throw new ArgumentNullException("path");
            if (ctx == null) throw new ArgumentNullException("ctx");

            Path = path;
            _ctx = ctx;

            bool existed = File.Exists(Path);
            long len = 0;
            try { if (existed) len = new FileInfo(Path).Length; } catch { /* ignore */ }

            var fs = new FileStream(Path, FileMode.Append, FileAccess.Write, FileShare.Read);

            // BOM only for brand new file, avoid multiple BOM in stacked file
            _w = new StreamWriter(fs, new UTF8Encoding(encoderShouldEmitUTF8Identifier: !existed));
            _w.AutoFlush = true;

            _writeHeader = (len == 0);
        }

        public void WriteHeaderIfNeeded()
        {
            if (!_writeHeader) return;

            // duration_ms removed (no time-limit), keep poll_ms + cmdline
            _w.WriteLine(
                "run_id,run_start_local,run_start_utc,host,user,app_path,poll_ms,cmdline," +
                "local_time,elapsed_ms,event,event_idx,pid,process,process_path,hwnd,title,old_title,new_title," +
                "total_events,added,removed,changed");
        }

        public void WriteRunStart()
        {
            WriteRow(
                localTime: _ctx.RunStartLocal,
                elapsedMs: 0,
                evt: "RUN_START",
                eventIdx: 0,
                pid: "",
                proc: "",
                procPath: "",
                hwnd: "",
                title: "",
                oldTitle: "",
                newTitle: "",
                stats: null
            );
        }

        public void WriteRunEnd(TimeSpan elapsed, MonitorStats stats)
        {
            WriteRow(
                localTime: DateTime.Now,
                elapsedMs: (long)elapsed.TotalMilliseconds,
                evt: "RUN_END",
                eventIdx: Interlocked.Read(ref _eventIdx),
                pid: "",
                proc: "",
                procPath: "",
                hwnd: "",
                title: "",
                oldTitle: "",
                newTitle: "",
                stats: stats
            );
        }

        public void WriteEvent(EventRecord r)
        {
            var idx = Interlocked.Increment(ref _eventIdx);

            var localTime = DateTime.Now;
            long elapsedMs = (long)r.SinceStart.TotalMilliseconds;

            string evt = r.Type.ToString();
            string pid = r.Info.Pid.ToString(CultureInfo.InvariantCulture);
            string proc = r.Info.ProcessName ?? "";
            string procPath = r.Info.ProcessPath ?? "";
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

            WriteRow(
                localTime: localTime,
                elapsedMs: elapsedMs,
                evt: evt,
                eventIdx: idx,
                pid: pid,
                proc: proc,
                procPath: procPath,
                hwnd: hwnd,
                title: title,
                oldTitle: oldTitle,
                newTitle: newTitle,
                stats: null
            );
        }

        private void WriteRow(
            DateTime localTime,
            long elapsedMs,
            string evt,
            long eventIdx,
            string pid,
            string proc,
            string procPath,
            string hwnd,
            string title,
            string oldTitle,
            string newTitle,
            MonitorStats stats)
        {
            string runStartLocalStr = _ctx.RunStartLocal.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);
            string runStartUtcStr = _ctx.RunStartUtc.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture) + "Z";
            string localTimeStr = localTime.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture);

            string totalEvents = (stats == null) ? "" : stats.TotalEvents.ToString(CultureInfo.InvariantCulture);
            string added = (stats == null) ? "" : stats.Added.ToString(CultureInfo.InvariantCulture);
            string removed = (stats == null) ? "" : stats.Removed.ToString(CultureInfo.InvariantCulture);
            string changed = (stats == null) ? "" : stats.Changed.ToString(CultureInfo.InvariantCulture);

            _w.WriteLine(string.Join(",",
                Csv(_ctx.RunId),
                Csv(runStartLocalStr),
                Csv(runStartUtcStr),
                Csv(_ctx.Host),
                Csv(_ctx.User),
                Csv(_ctx.AppPath),
                _ctx.PollMs.ToString(CultureInfo.InvariantCulture),
                Csv(_ctx.CmdLine),

                Csv(localTimeStr),
                elapsedMs.ToString(CultureInfo.InvariantCulture),
                Csv(evt),
                eventIdx.ToString(CultureInfo.InvariantCulture),

                string.IsNullOrEmpty(pid) ? "" : pid,
                Csv(proc),
                Csv(procPath),
                Csv(hwnd),
                Csv(title),
                Csv(oldTitle),
                Csv(newTitle),

                string.IsNullOrEmpty(totalEvents) ? "" : totalEvents,
                string.IsNullOrEmpty(added) ? "" : added,
                string.IsNullOrEmpty(removed) ? "" : removed,
                string.IsNullOrEmpty(changed) ? "" : changed
            ));
        }

        private static string Csv(string s)
        {
            if (s == null) s = "";
            return "\"" + s.Replace("\"", "\"\"") + "\"";
        }

        public void Dispose()
        {
            try { if (_w != null) _w.Dispose(); } catch { /* ignore */ }
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

            _header.PrintColored();
            linesWritten += 10; // rough estimate

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
    }

    internal enum EventType { ADD, DEL, CHG }

    internal sealed class EventRecord
    {
        public EventType Type { get; private set; }
        public TimeSpan SinceStart { get; private set; }
        public WindowInfo Info { get; private set; }

        public string OldTitle { get; private set; }
        public string NewTitle { get; private set; }

        public static EventRecord Add(TimeSpan ts, WindowInfo w)
        {
            return new EventRecord { Type = EventType.ADD, SinceStart = ts, Info = w };
        }

        public static EventRecord Del(TimeSpan ts, WindowInfo w)
        {
            return new EventRecord { Type = EventType.DEL, SinceStart = ts, Info = w };
        }

        public static EventRecord Chg(TimeSpan ts, WindowInfo w, string oldTitle, string newTitle)
        {
            return new EventRecord
            {
                Type = EventType.CHG,
                SinceStart = ts,
                Info = w,
                OldTitle = oldTitle ?? "",
                NewTitle = newTitle ?? ""
            };
        }
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
            var parts = new List<string>();
            parts.Add(TextWidth.PadRightDisplay("TIME", _wTime));
            parts.Add(TextWidth.PadRightDisplay("EVT", _wEvt));

            if (_showPid) parts.Add(TextWidth.PadRightDisplay("PID", _wPid));
            if (_showProcess) parts.Add(TextWidth.PadRightDisplay("PROCESS", _wProc));
            if (_showHwnd) parts.Add(TextWidth.PadRightDisplay("HWND", _wHwnd));

            parts.Add(TextWidth.PadRightDisplay("TITLE", _wTitle));
            return string.Join("  ", parts.ToArray());
        }

        public string Format(EventRecord rec)
        {
            string ts = rec.SinceStart.ToString(@"mm\:ss\.fff", CultureInfo.InvariantCulture);
            string evt = rec.Type.ToString();

            string pid = rec.Info.Pid >= 0 ? rec.Info.Pid.ToString(CultureInfo.InvariantCulture) : "-";
            string proc = string.IsNullOrWhiteSpace(rec.Info.ProcessName) ? "Unknown" : rec.Info.ProcessName;
            string hwnd = string.Format("0x{0:X8}", rec.Info.Hwnd.ToInt64());

            string title;
            if (rec.Type == EventType.CHG)
            {
                string oldT = TextWidth.Normalize(rec.OldTitle);
                string newT = TextWidth.Normalize(rec.NewTitle);
                title = oldT + " -> " + newT;
            }
            else
            {
                title = TextWidth.Normalize(rec.Info.Title);
            }

            var parts = new List<string>();
            parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(ts, _wTime), _wTime));
            parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(evt, _wEvt), _wEvt));

            if (_showPid)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(pid, _wPid), _wPid));
            if (_showProcess)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(proc, _wProc), _wProc));
            if (_showHwnd)
                parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(hwnd, _wHwnd), _wHwnd));

            parts.Add(TextWidth.PadRightDisplay(TextWidth.TruncateToDisplayWidth(title, _wTitle), _wTitle));
            return string.Join("  ", parts.ToArray());
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

        // ASCII=1，非ASCII≈2
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
            if (s == null) s = string.Empty;
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
            if (capacity <= 0) throw new ArgumentOutOfRangeException("capacity");
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

    // ===================== Window Diff / Snapshot =====================

    internal sealed class WindowDiff
    {
        public List<WindowInfo> Added { get; private set; }
        public List<WindowInfo> Removed { get; private set; }
        public List<WindowTitleChange> TitleChanged { get; private set; }

        public WindowDiff()
        {
            Added = new List<WindowInfo>();
            Removed = new List<WindowInfo>();
            TitleChanged = new List<WindowTitleChange>();
        }

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
                WindowInfo oldInfo;
                if (!prev.Windows.TryGetValue(kv.Key, out oldInfo)) continue;

                var newInfo = kv.Value;
                if (!string.Equals(oldInfo.Title, newInfo.Title, StringComparison.Ordinal))
                    d.TitleChanged.Add(new WindowTitleChange(oldInfo, newInfo));
            }

            return d;
        }
    }

    internal sealed class WindowTitleChange
    {
        public WindowInfo OldInfo { get; private set; }
        public WindowInfo NewInfo { get; private set; }

        public WindowTitleChange(WindowInfo oldInfo, WindowInfo newInfo)
        {
            OldInfo = oldInfo;
            NewInfo = newInfo;
        }
    }

    internal sealed class WindowSnapshot
    {
        public Dictionary<IntPtr, WindowInfo> Windows { get; private set; }

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

                uint pid;
                NativeMethods.GetWindowThreadProcessId(hWnd, out pid);
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
                try { path = p.MainModule != null ? p.MainModule.FileName : null; } catch { /* ignore */ }
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
