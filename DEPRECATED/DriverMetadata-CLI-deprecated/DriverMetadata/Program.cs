using System;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace DriverMetadata
{
    class Program
    {
        static void Main(string[] args)
        {
            InitializeConsole();

            // 1. Retrieve all drivers matching 'Lenovo'
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

                var item = new DriverExportItem
                {
                    DeviceName = driver.DeviceName,
                    Version = driver.Version,
                    Manufacturer = driver.Manufacturer,
                    InfName = driver.InfName,
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
                        // 3. Exclude HWID fields from console and JSON
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

        static void InitializeConsole()
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "Lenovo Driver Metadata Tool v1.0";

            const string MyEmail = "liuty24@lenovo.com";
            const string SubHeader = "SYSTEM DRIVER METADATA TOOL | LENOVO PLATFORM";

            string[] artLines = new string[]
            {
        "████▄  ▄▄▄▄  ▄▄ ▄▄ ▄▄ ▄▄▄▄▄ ▄▄▄▄    ██▄  ▄██ ▄▄▄▄▄ ▄▄▄▄▄▄ ▄▄▄  ▄▄▄▄   ▄▄▄ ▄▄▄▄▄▄ ▄▄▄",
        "██  ██ ██▄█▄ ██ ██▄██ ██▄▄  ██▄█▄   ██ ▀▀ ██ ██▄▄    ██  ██▀██ ██▀██ ██▀██  ██  ██▀██",
        "████▀  ██ ██ ██  ▀█▀  ██▄▄▄ ██ ██   ██    ██ ██▄▄▄   ██  ██▀██ ████▀ ██▀██  ██  ██▀██"
            };

            // 1. 动态计算宽度
            int maxArtLength = 0;
            foreach (var line in artLines) if (line.Length > maxArtLength) maxArtLength = line.Length;

            // 确保总宽度足够容纳艺术字、副标题和邮箱
            int totalWidth = Math.Max(maxArtLength + 10, SubHeader.Length + 10);
            totalWidth = Math.Max(totalWidth, MyEmail.Length + 15);

            // 2. 绘制主框图 (青色)
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

            // 右下角邮箱
            int emailPadding = Math.Max(0, totalWidth - 2 - MyEmail.Length - 1);
            Console.WriteLine("║" + new string(' ', emailPadding) + MyEmail + " ║");

            Console.WriteLine("╚" + new string('═', totalWidth - 2) + "╝");

            // 3. 绘制居中的副标题 (深青色)
            Console.ForegroundColor = ConsoleColor.DarkCyan;
            Console.WriteLine(" " + new string('─', totalWidth - 2));

            // 计算副标题居中所需的空格
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
        public Dictionary<string, string> Metadata { get; set; }
    }

    public static class JsonExporter
    {
        // FIXED FILENAME
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

            // File.WriteAllText overwrites by default
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
    }

    public static class DriverService
    {
        public static List<DriverInfo> GetLenovoDrivers()
        {
            var list = new List<DriverInfo>();
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_PnPSignedDriver WHERE Manufacturer LIKE '%Lenovo%'"))
                {
                    foreach (ManagementObject obj in searcher.Get())
                    {
                        list.Add(new DriverInfo
                        {
                            DeviceName = obj["DeviceName"]?.ToString() ?? "Unknown",
                            Version = obj["DriverVersion"]?.ToString() ?? "N/A",
                            Manufacturer = obj["Manufacturer"]?.ToString() ?? "N/A",
                            InfName = obj["InfName"]?.ToString() ?? ""
                        });
                    }
                }
            }
            catch { }
            return list;
        }

        public static string FindCatPath(string infName)
        {
            if (string.IsNullOrEmpty(infName)) return null;
            string path = Path.Combine(@"C:\Windows\System32\CatRoot\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}", Path.ChangeExtension(infName, ".cat"));
            return File.Exists(path) ? path : null;
        }
    }

    public static class CatParser
    {
        public static List<KeyValuePair<string, string>> ExtractMetadata(string filePath)
        {
            var results = new List<KeyValuePair<string, string>>();
            IntPtr hCertStore = IntPtr.Zero, hCryptMsg = IntPtr.Zero, pCtlContext = IntPtr.Zero;
            int enc, cont, form;

            if (NativeMethods.CryptQueryObject(1, filePath, 0x3FFF, 0xE, 0, out enc, out cont, out form, ref hCertStore, ref hCryptMsg, ref pCtlContext))
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
                if (data[p++] == 0x02) { int iLen = GetLen(data, p, out int h2); p += h2 + iLen; }
                if (p < data.Length && data[p++] == 0x04)
                {
                    int vLen = GetLen(data, p, out int h3);
                    return new KeyValuePair<string, string>(label, Encoding.Unicode.GetString(data, p + h3, vLen).Replace("\0", "").Trim());
                }
            }
            catch { }
            return null;
        }

        private static int GetLen(byte[] d, int p, out int h)
        {
            byte b = d[p]; if (b <= 0x7F) { h = 1; return b; }
            int n = b & 0x7F; int l = 0;
            for (int i = 1; i <= n; i++) l = (l << 8) | d[p + i];
            h = 1 + n; return l;
        }
    }

    internal static class NativeMethods
    {
        [DllImport("crypt32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern bool CryptQueryObject(int t, [MarshalAs(UnmanagedType.LPWStr)] string o, int eC, int eF, int f, out int et, out int ct, out int ft, ref IntPtr s, ref IntPtr m, ref IntPtr p);
        [DllImport("crypt32.dll")] public static extern bool CertFreeCTLContext(IntPtr p);
        [StructLayout(LayoutKind.Sequential)] public struct CTL_CONTEXT { public int dwEnc; public IntPtr pbEnc; public int cbEnc; public IntPtr pCtlInfo; public IntPtr hCertStore; public IntPtr hCryptMsg; }
        [StructLayout(LayoutKind.Sequential)] public struct CTL_INFO { public int v; public CRYPT_DATA_BLOB usage; public CRYPT_DATA_BLOB id; public CRYPT_DATA_BLOB seq; public long t1; public long t2; public CRYPT_ALGO algo; public int cEntry; public IntPtr rgEntry; public int cExtension; public IntPtr rgExtension; }
        [StructLayout(LayoutKind.Sequential)] public struct CERT_EXTENSION { [MarshalAs(UnmanagedType.LPStr)] public string pszObjId; public bool f; public CRYPT_DATA_BLOB Value; }
        [StructLayout(LayoutKind.Sequential)] public struct CRYPT_DATA_BLOB { public int cbData; public IntPtr pbData; }
        [StructLayout(LayoutKind.Sequential)] public struct CRYPT_ALGO { [MarshalAs(UnmanagedType.LPStr)] public string p; public CRYPT_DATA_BLOB para; }
    }
    #endregion
}