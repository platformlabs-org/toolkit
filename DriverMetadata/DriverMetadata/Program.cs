using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace DriverMetadata
{
    class Program
    {
        static void Main(string[] args)
        {
            InitializeConsole();

            // ✅ NEW: 参数模式
            // - 指定 .cat 文件：只解析该 cat
            // - 指定文件夹：递归遍历所有 cat
            if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
            {
                string inputPath = args[0].Trim().Trim('"'); // 支持带引号路径

                if (File.Exists(inputPath))
                {
                    if (string.Equals(Path.GetExtension(inputPath), ".cat", StringComparison.OrdinalIgnoreCase))
                    {
                        RunSingleCat(inputPath);
                    }
                    else
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine($"❌ Input is a file but not a .cat: {inputPath}");
                        Console.ResetColor();
                    }

                    Console.WriteLine("\nfinished. Press any key to exit...");
                    Console.ReadKey();
                    return;
                }

                if (Directory.Exists(inputPath))
                {
                    RunFolderCats(inputPath);

                    Console.WriteLine("\nfinished. Press any key to exit...");
                    Console.ReadKey();
                    return;
                }

                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"❌ Path not found: {inputPath}");
                Console.ResetColor();

                Console.WriteLine("\nfinished. Press any key to exit...");
                Console.ReadKey();
                return;
            }

            // ====== 原来的系统扫描逻辑（不带参数时走这里） ======
            var drivers = DriverService.GetLenovoDrivers();
            var exportList = new List<DriverExportItem>();

            if (drivers.Count == 0)
            {
                Console.WriteLine("No Lenovo drivers found in the system.");
            }

            foreach (var driver in drivers)
            {
                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine($"[DEVICE] {driver.DeviceName}");
                Console.ResetColor();

                Console.WriteLine($" ├─ Version: {driver.Version} | Manufacturer: {driver.Manufacturer}");

                if (!string.IsNullOrWhiteSpace(driver.PnpDeviceId))
                    Console.WriteLine($" ├─ PnP DeviceID: {driver.PnpDeviceId}");

                if (!string.IsNullOrWhiteSpace(driver.SignedDriverHardwareId))
                    Console.WriteLine($" ├─ SignedDriver HardWareID: {driver.SignedDriverHardwareId}");

                // ✅ 显示用优先：优先把“命中 HWID”显示成 ACPI\IDEA200A 这种更直观的形式
                if (!string.IsNullOrWhiteSpace(driver.DisplayMatchedHardwareId))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($" ├─ Matched HWID (DISPLAY): {driver.DisplayMatchedHardwareId}");
                    Console.ResetColor();
                }
                else if (!string.IsNullOrWhiteSpace(driver.RawMatchedHardwareId))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($" ├─ Matched HWID (DISPLAY): {driver.RawMatchedHardwareId}");
                    Console.ResetColor();
                }

                // 打印 HWID 列表，并高亮“显示用命中项”
                if (driver.HardwareIds != null && driver.HardwareIds.Count > 0)
                {
                    Console.WriteLine(" ├─ HardwareID(s):");

                    foreach (var hid in driver.HardwareIds)
                    {
                        bool isMatchedForDisplay = DriverService.IsMatchedForDisplay(
                            hid,
                            driver.DisplayMatchedHardwareId,
                            driver.RawMatchedHardwareId);

                        if (isMatchedForDisplay)
                        {
                            Console.ForegroundColor = ConsoleColor.Green;
                            Console.WriteLine($" │   ► {hid}   [HIT ID]");
                            Console.ResetColor();
                        }
                        else
                        {
                            Console.ForegroundColor = ConsoleColor.DarkYellow;
                            Console.WriteLine($" │     {hid}");
                            Console.ResetColor();
                        }
                    }
                }
                else
                {
                    Console.WriteLine(" ├─ HardwareID(s): (N/A)");
                }

                // 可选：打印 CompatibleID(s)
                if (driver.CompatibleIds != null && driver.CompatibleIds.Count > 0)
                {
                    Console.WriteLine(" ├─ CompatibleID(s):");
                    foreach (var cid in driver.CompatibleIds)
                    {
                        Console.ForegroundColor = ConsoleColor.DarkGray;
                        Console.WriteLine($" │     {cid}");
                        Console.ResetColor();
                    }
                }

                // 构造导出对象
                var item = new DriverExportItem
                {
                    DeviceName = driver.DeviceName,
                    Version = driver.Version,
                    Manufacturer = driver.Manufacturer,
                    InfName = driver.InfName,

                    PnpDeviceId = driver.PnpDeviceId,
                    SignedDriverHardwareId = driver.SignedDriverHardwareId,
                    HardwareIds = driver.HardwareIds,
                    CompatibleIds = driver.CompatibleIds,

                    // ✅ 两个都导出：Raw 是“真实匹配键”（WMI 给的），Display 是“显示用优先”
                    RawMatchedHardwareId = driver.RawMatchedHardwareId,
                    DisplayMatchedHardwareId = driver.DisplayMatchedHardwareId,

                    Metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                };

                // 2. Locate and parse associated .cat file
                string catPath = DriverService.FindCatPath(driver.InfName);
                if (!string.IsNullOrEmpty(catPath))
                {
                    Console.WriteLine($" └─ Catalog: {catPath}");
                    item.CatalogPath = catPath;

                    var metadata = CatParser.ExtractMetadata(catPath);
                    foreach (var entry in metadata)
                    {
                        // 维持你原来的逻辑：排除 HWID 字段（如果 CAT 里有 HWID 相关键）
                        if (!entry.Key.StartsWith("HWID", StringComparison.OrdinalIgnoreCase))
                        {
                            Console.ForegroundColor = ConsoleColor.Yellow;
                            Console.Write($"    > {entry.Key,-22} : ");
                            Console.ResetColor();
                            Console.WriteLine(entry.Value);

                            item.Metadata[entry.Key] = entry.Value;
                        }
                    }
                }
                else
                {
                    Console.WriteLine(" └─ Catalog: Not found or not signed.");
                }

                exportList.Add(item);
                Console.WriteLine(new string('-', 90));
            }

            // === Export to Fixed JSON File (Overwrite mode) ===
            try
            {
                string jsonPath = JsonExporter.WriteToDesktop(exportList);
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"\n✅ Report updated at: {jsonPath}");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\n❌ JSON write failed: {ex.Message}");
                Console.ResetColor();
            }

            Console.WriteLine("\nfinished. Press any key to exit...");
            Console.ReadKey();
        }

        // ✅ NEW: 只解析一个 cat 文件
        private static void RunSingleCat(string catPath)
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine($"[CAT] {catPath}");
            Console.ResetColor();

            try
            {
                var metadata = CatParser.ExtractMetadata(catPath);
                if (metadata == null || metadata.Count == 0)
                {
                    Console.ForegroundColor = ConsoleColor.DarkYellow;
                    Console.WriteLine(" └─ No metadata found (not signed / unsupported format / no target OID).");
                    Console.ResetColor();
                    Console.WriteLine(new string('-', 90));
                    return;
                }

                foreach (var entry in metadata)
                {
                    if (!entry.Key.StartsWith("HWID", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.ForegroundColor = ConsoleColor.Yellow;
                        Console.Write($"    > {entry.Key,-22} : ");
                        Console.ResetColor();
                        Console.WriteLine(entry.Value);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($" └─ Parse failed: {ex.Message}");
                Console.ResetColor();
            }

            Console.WriteLine(new string('-', 90));
        }

        // ✅ NEW: 遍历文件夹内所有 cat（含子目录）
        private static void RunFolderCats(string folderPath)
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine($"[FOLDER] {folderPath}");
            Console.ResetColor();

            IEnumerable<string> cats;
            try
            {
                cats = Directory.EnumerateFiles(folderPath, "*.cat", SearchOption.AllDirectories);
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"❌ Enumerate failed: {ex.Message}");
                Console.ResetColor();
                return;
            }

            int total = 0, ok = 0, empty = 0, failed = 0;

            foreach (var cat in cats)
            {
                total++;

                Console.ForegroundColor = ConsoleColor.Cyan;
                Console.WriteLine($"[CAT] {cat}");
                Console.ResetColor();

                try
                {
                    var metadata = CatParser.ExtractMetadata(cat);

                    if (metadata == null || metadata.Count == 0)
                    {
                        empty++;
                        Console.ForegroundColor = ConsoleColor.DarkYellow;
                        Console.WriteLine(" └─ No metadata found (not signed / unsupported format / no target OID).");
                        Console.ResetColor();
                    }
                    else
                    {
                        ok++;
                        foreach (var entry in metadata)
                        {
                            if (!entry.Key.StartsWith("HWID", StringComparison.OrdinalIgnoreCase))
                            {
                                Console.ForegroundColor = ConsoleColor.Yellow;
                                Console.Write($"    > {entry.Key,-22} : ");
                                Console.ResetColor();
                                Console.WriteLine(entry.Value);
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    failed++;
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($" └─ Parse failed: {ex.Message}");
                    Console.ResetColor();
                }

                Console.WriteLine(new string('-', 90));
            }

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"✅ Done. Total: {total}, OK: {ok}, Empty: {empty}, Failed: {failed}");
            Console.ResetColor();
        }

        static void InitializeConsole()
        {
            // 更稳：某些宿主/重定向场景 Console 句柄可能无效
            try { Console.OutputEncoding = Encoding.UTF8; } catch { }
            try { Console.Title = "Lenovo Driver Metadata Tool v1.2"; } catch { }

            const string MyEmail = "liuty24@lenovo.com";
            const string SubHeader = "SYSTEM DRIVER METADATA TOOL | LENOVO PLATFORM";

            string[] artLines = new string[]
            {
                "████▄  ▄▄▄▄  ▄▄ ▄▄ ▄▄ ▄▄▄▄▄ ▄▄▄▄    ██▄  ▄██ ▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄▄  ▄▄▄▄   ▄▄▄ ▄▄▄▄▄▄ ▄▄▄",
                "██  ██ ██▄█▄ ██ ██▄██ ██▄▄  ██▄█▄   ██ ▀▀ ██ ██▄▄    ██  ██▀██ ██▀██ ██▀██  ██  ██▀██",
                "████▀  ██ ██ ██  ▀█▀  ██▄▄▄ ██ ██   ██    ██ ██▄▄▄   ██  ██▀██ ████▀ ██▀██  ██  ██▀██"
            };

            int maxArtLength = 0;
            foreach (var line in artLines) if (line.Length > maxArtLength) maxArtLength = line.Length;

            int totalWidth = Math.Max(maxArtLength + 10, SubHeader.Length + 10);
            totalWidth = Math.Max(totalWidth, MyEmail.Length + 15);

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("╔" + new string('═', totalWidth - 2) + "╗");

            foreach (var line in artLines)
            {
                int padding = Math.Max(0, (totalWidth - 2 - line.Length) / 2);
                string leftPad = new string(' ', padding);
                string rightPad = new string(' ', Math.Max(0, totalWidth - 2 - line.Length - padding));
                Console.WriteLine("║" + leftPad + line + rightPad + "║");
            }

            Console.WriteLine("║" + new string(' ', totalWidth - 2) + "║");

            int emailPadding = Math.Max(0, totalWidth - 2 - MyEmail.Length - 1);
            Console.WriteLine("║" + new string(' ', emailPadding) + MyEmail + " ║");

            Console.WriteLine("╚" + new string('═', totalWidth - 2) + "╝");

            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine(" " + new string('─', totalWidth - 2));

            int subHeaderPadding = Math.Max(0, (totalWidth - SubHeader.Length) / 2);
            Console.WriteLine(new string(' ', subHeaderPadding) + SubHeader);

            Console.WriteLine(" " + new string('─', totalWidth - 2));
            Console.ResetColor();
            Console.WriteLine();
        }
    }

    #region Models & JSON Logic

    public sealed class DriverExportItem
    {
        public string DeviceName { get; set; }
        public string Version { get; set; }
        public string Manufacturer { get; set; }
        public string InfName { get; set; }
        public string CatalogPath { get; set; }

        public string PnpDeviceId { get; set; }
        public string SignedDriverHardwareId { get; set; }
        public List<string> HardwareIds { get; set; }
        public List<string> CompatibleIds { get; set; }

        // ✅ Raw：WMI 认为的“真实匹配键”；Display：显示用优先（例如 ACPI\IDEA200A）
        public string RawMatchedHardwareId { get; set; }
        public string DisplayMatchedHardwareId { get; set; }

        public Dictionary<string, string> Metadata { get; set; }
    }

    public static class JsonExporter
    {
        private const string OutputFile = "DriverMetadata.json";

        public static string WriteToDesktop<T>(T obj)
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string path = Path.Combine(desktop, OutputFile);

            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };

            string json = JsonSerializer.Serialize(obj, options);
            File.WriteAllText(path, json, new UTF8Encoding(false));
            return path;
        }
    }

    #endregion

    #region OS & Parsing Services

    public class DriverInfo
    {
        public string DeviceName { get; set; }
        public string Version { get; set; }
        public string Manufacturer { get; set; }
        public string InfName { get; set; }

        public string PnpDeviceId { get; set; }
        public string SignedDriverHardwareId { get; set; }

        public List<string> HardwareIds { get; set; }
        public List<string> CompatibleIds { get; set; }

        // ✅ Raw：真实匹配键；Display：显示用优先
        public string RawMatchedHardwareId { get; set; }
        public string DisplayMatchedHardwareId { get; set; }
    }

    internal sealed class IdQueryResult
    {
        public List<string> HardwareIds { get; set; }
        public List<string> CompatibleIds { get; set; }

        public IdQueryResult()
        {
            HardwareIds = new List<string>();
            CompatibleIds = new List<string>();
        }
    }

    public static class DriverService
    {
        // ACPI\VEN_XXX&DEV_YYYY  -> ACPI\XXXYYYY（显示用优先）
        private static readonly Regex AcpiVenDevRegex =
            new Regex(@"^ACPI\\VEN_([A-Z0-9]{3})&DEV_([0-9A-F]{4})$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static List<DriverInfo> GetLenovoDrivers()
        {
            var list = new List<DriverInfo>();

            try
            {
                string q = "SELECT DeviceName, DriverVersion, Manufacturer, InfName, DeviceID, HardWareID " +
                           "FROM Win32_PnPSignedDriver WHERE Manufacturer LIKE '%Lenovo%'";
                //"FROM Win32_PnPSignedDriver";

                using (var searcher = new ManagementObjectSearcher(q))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        string pnpDeviceId = obj["DeviceID"] == null ? "" : obj["DeviceID"].ToString();
                        string signedHwid = obj["HardWareID"] == null ? "" : obj["HardWareID"].ToString();

                        var info = new DriverInfo
                        {
                            DeviceName = obj["DeviceName"] == null ? "Unknown" : obj["DeviceName"].ToString(),
                            Version = obj["DriverVersion"] == null ? "N/A" : obj["DriverVersion"].ToString(),
                            Manufacturer = obj["Manufacturer"] == null ? "N/A" : obj["Manufacturer"].ToString(),
                            InfName = obj["InfName"] == null ? "" : obj["InfName"].ToString(),

                            PnpDeviceId = pnpDeviceId,
                            SignedDriverHardwareId = signedHwid
                        };

                        // 查 Win32_PnPEntity 的 HardwareID[] / CompatibleID[]
                        IdQueryResult ids = GetIdsFromPnPEntity(pnpDeviceId);
                        info.HardwareIds = ids.HardwareIds;
                        info.CompatibleIds = ids.CompatibleIds;

                        // ✅ Raw 匹配键：优先用 WMI SignedDriver.HardWareID；如果为空再兜底用第一条 HWID
                        info.RawMatchedHardwareId = PickRawMatchedHardwareId(info.SignedDriverHardwareId, info.HardwareIds);

                        // ✅ Display 优先：尽量把显示用 HWID 转成 ACPI\IDEA200A 这类更直观形式
                        info.DisplayMatchedHardwareId = PickDisplayMatchedHardwareId(info.RawMatchedHardwareId, info.HardwareIds);

                        list.Add(info);
                    }
                }
            }
            catch
            {
                // 保持你原来的“尽量不打断执行”的风格
            }

            return list;
        }

        public static string FindCatPath(string infName)
        {
            if (string.IsNullOrEmpty(infName)) return null;
            string path = Path.Combine(
                @"C:\Windows\System32\CatRoot\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}",
                Path.ChangeExtension(infName, ".cat")
            );
            return File.Exists(path) ? path : null;
        }

        public static bool IsMatchedForDisplay(string candidate, string displayMatch, string rawMatch)
        {
            string c = (candidate ?? "").Trim();
            string d = (displayMatch ?? "").Trim();
            string r = (rawMatch ?? "").Trim();

            if (!string.IsNullOrEmpty(d) && string.Equals(c, d, StringComparison.OrdinalIgnoreCase))
                return true;

            // 如果 displayMatch 不在列表里（比如计算出来但设备没提供），就退回 rawMatch 高亮
            if (string.IsNullOrEmpty(d) && !string.IsNullOrEmpty(r) && string.Equals(c, r, StringComparison.OrdinalIgnoreCase))
                return true;

            return false;
        }

        private static IdQueryResult GetIdsFromPnPEntity(string deviceId)
        {
            var result = new IdQueryResult();

            if (string.IsNullOrWhiteSpace(deviceId))
                return result;

            try
            {
                string escaped = EscapeWqlString(deviceId);
                string q = "SELECT HardwareID, CompatibleID FROM Win32_PnPEntity WHERE DeviceID='" + escaped + "'";

                using (var searcher = new ManagementObjectSearcher(q))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        if (obj["HardwareID"] is string[] hwArr)
                        {
                            foreach (var s in hwArr)
                                if (!string.IsNullOrWhiteSpace(s)) result.HardwareIds.Add(s);
                        }

                        if (obj["CompatibleID"] is string[] compArr)
                        {
                            foreach (var s in compArr)
                                if (!string.IsNullOrWhiteSpace(s)) result.CompatibleIds.Add(s);
                        }
                    }
                }
            }
            catch
            {
                // ignore
            }

            // 去重但保序
            result.HardwareIds = result.HardwareIds.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            result.CompatibleIds = result.CompatibleIds.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            return result;
        }

        private static string PickRawMatchedHardwareId(string signedHwid, List<string> hwids)
        {
            if (hwids == null) hwids = new List<string>();
            signedHwid = (signedHwid ?? "").Trim();

            if (!string.IsNullOrEmpty(signedHwid))
            {
                // 先尝试让它落到列表中的某个“等价项”
                string exact = hwids.FirstOrDefault(h => string.Equals((h ?? "").Trim(), signedHwid, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(exact)) return exact;

                // 前缀/反向前缀兜底
                string byPrefix = hwids.FirstOrDefault(h => !string.IsNullOrWhiteSpace(h) &&
                                                            h.StartsWith(signedHwid, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(byPrefix)) return byPrefix;

                string reversePrefix = hwids
                    .Where(h => !string.IsNullOrWhiteSpace(h))
                    .OrderByDescending(h => h.Length)
                    .FirstOrDefault(h => signedHwid.StartsWith(h, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(reversePrefix)) return reversePrefix;

                // 最后兜底：就用 WMI 给的
                return signedHwid;
            }

            // 没有 signedHwid：兜底用第一条
            string first = hwids.FirstOrDefault(h => !string.IsNullOrWhiteSpace(h));
            return first ?? "";
        }

        private static string PickDisplayMatchedHardwareId(string rawMatched, List<string> hwids)
        {
            if (hwids == null) hwids = new List<string>();
            rawMatched = (rawMatched ?? "").Trim();

            if (string.IsNullOrEmpty(rawMatched))
            {
                string first = hwids.FirstOrDefault(h => !string.IsNullOrWhiteSpace(h));
                return first ?? "";
            }

            // ✅ 特殊优化：ACPI\VEN_XXX&DEV_YYYY -> 优先显示 ACPI\XXXYYYY（如果列表里存在）
            Match m = AcpiVenDevRegex.Match(rawMatched);
            if (m.Success)
            {
                string ven = m.Groups[1].Value.ToUpperInvariant();
                string dev = m.Groups[2].Value.ToUpperInvariant();
                string preferred = "ACPI\\" + ven + dev; // 例如 ACPI\IDEA200A

                string hit = hwids.FirstOrDefault(h => string.Equals((h ?? "").Trim(), preferred, StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrEmpty(hit))
                    return hit;
            }

            // ✅ 通用“显示更直观”规则：优先选择没有 & 的那条（例如 ACPI\IDEA200A），再排除通配 * 开头
            // 注意：只在该设备确实同时提供这些 ID 时才会这么选
            string noAmp = hwids.FirstOrDefault(h => !string.IsNullOrWhiteSpace(h) &&
                                                     h.IndexOf('&') < 0 &&
                                                     !h.TrimStart().StartsWith("*", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(noAmp))
                return noAmp;

            // ✅ 再次兜底：如果 rawMatched 本身就在列表里，用它
            string exact = hwids.FirstOrDefault(h => string.Equals((h ?? "").Trim(), rawMatched, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(exact))
                return exact;

            // ✅ 最终兜底：rawMatched
            return rawMatched;
        }

        private static string EscapeWqlString(string value)
        {
            // WQL 字符串：' 需要写成 ''；一些 provider 对 \\\\ 更友好
            return (value ?? "").Replace(@"\", @"\\").Replace("'", "''");
        }
    }

    public static class CatParser
    {
        public static List<KeyValuePair<string, string>> ExtractMetadata(string filePath)
        {
            var results = new List<KeyValuePair<string, string>>();
            IntPtr hCertStore = IntPtr.Zero, hCryptMsg = IntPtr.Zero, pCtlContext = IntPtr.Zero;
            int enc, cont, form;

            if (NativeMethods.CryptQueryObject(1, filePath, 0x3FFF, 0xE, 0, out enc, out cont, out form,
                                               ref hCertStore, ref hCryptMsg, ref pCtlContext))
            {
                var context = (NativeMethods.CTL_CONTEXT)Marshal.PtrToStructure(pCtlContext, typeof(NativeMethods.CTL_CONTEXT));
                var info = (NativeMethods.CTL_INFO)Marshal.PtrToStructure(context.pCtlInfo, typeof(NativeMethods.CTL_INFO));

                for (int i = 0; i < info.cExtension; i++)
                {
                    IntPtr pExt = new IntPtr(info.rgExtension.ToInt64() + (i * Marshal.SizeOf(typeof(NativeMethods.CERT_EXTENSION))));
                    var ext = (NativeMethods.CERT_EXTENSION)Marshal.PtrToStructure(pExt, typeof(NativeMethods.CERT_EXTENSION));

                    if (ext.pszObjId == "1.3.6.1.4.1.311.12.2.1")
                    {
                        var pair = ParseAttr(ext.Value);
                        if (pair.HasValue) results.Add(pair.Value);
                    }
                }
                NativeMethods.CertFreeCTLContext(pCtlContext);
            }
            return results;
        }

        private static KeyValuePair<string, string>? ParseAttr(NativeMethods.CRYPT_DATA_BLOB blob)
        {
            byte[] data = new byte[blob.cbData];
            Marshal.Copy(blob.pbData, data, 0, blob.cbData);
            try
            {
                int p = 0;
                if (data[p++] != 0x30) return null;
                p += (data[p] <= 0x7F ? 1 : 1 + (data[p] & 0x7F));
                if (data[p++] != 0x1E) return null;

                int lLen = GetLen(data, p, out int h1);
                string label = Encoding.BigEndianUnicode.GetString(data, p + h1, lLen).Replace("\0", "").Trim();
                p += h1 + lLen;

                if (p < data.Length && data[p++] == 0x02)
                {
                    int iLen = GetLen(data, p, out int h2);
                    p += h2 + iLen;
                }

                if (p < data.Length && data[p++] == 0x04)
                {
                    int vLen = GetLen(data, p, out int h3);
                    return new KeyValuePair<string, string>(
                        label,
                        Encoding.Unicode.GetString(data, p + h3, vLen).Replace("\0", "").Trim()
                    );
                }
            }
            catch { }
            return null;
        }

        private static int GetLen(byte[] d, int p, out int h)
        {
            byte b = d[p];
            if (b <= 0x7F) { h = 1; return b; }

            int n = b & 0x7F;
            int l = 0;
            for (int i = 1; i <= n; i++) l = (l << 8) | d[p + i];
            h = 1 + n;
            return l;
        }
    }

    internal static class NativeMethods
    {
        [DllImport("crypt32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool CryptQueryObject(
            int t,
            [MarshalAs(UnmanagedType.LPWStr)] string o,
            int eC,
            int eF,
            int f,
            out int et,
            out int ct,
            out int ft,
            ref IntPtr s,
            ref IntPtr m,
            ref IntPtr p
        );

        [DllImport("crypt32.dll")]
        public static extern bool CertFreeCTLContext(IntPtr p);

        [StructLayout(LayoutKind.Sequential)]
        public struct CTL_CONTEXT
        {
            public int dwEnc;
            public IntPtr pbEnc;
            public int cbEnc;
            public IntPtr pCtlInfo;
            public IntPtr hCertStore;
            public IntPtr hCryptMsg;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct CTL_INFO
        {
            public int v;
            public CRYPT_DATA_BLOB usage;
            public CRYPT_DATA_BLOB id;
            public CRYPT_DATA_BLOB seq;
            public long t1;
            public long t2;
            public CRYPT_ALGO algo;
            public int cEntry;
            public IntPtr rgEntry;
            public int cExtension;
            public IntPtr rgExtension;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct CERT_EXTENSION
        {
            [MarshalAs(UnmanagedType.LPStr)]
            public string pszObjId;
            public bool f;
            public CRYPT_DATA_BLOB Value;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct CRYPT_DATA_BLOB
        {
            public int cbData;
            public IntPtr pbData;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct CRYPT_ALGO
        {
            [MarshalAs(UnmanagedType.LPStr)]
            public string p;
            public CRYPT_DATA_BLOB para;
        }
    }

    #endregion
}
