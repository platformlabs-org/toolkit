using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using HlkxTool.Hlkx;

namespace HlkxTool.HlkxParsing
{
    internal static class PackageInfoConverter
    {
        private const string Unclassified = "Unclassified";

        public static ParsedPackageInfo Convert(Stream xmlStream)
        {
            var settings = new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                IgnoreWhitespace = false,
                IgnoreComments = true,
                IgnoreProcessingInstructions = true,
                MaxCharactersFromEntities = 0,
                MaxCharactersInDocument = 50L * 1024 * 1024
            };

            using (var xr = XmlReader.Create(xmlStream, settings))
            {
                var doc = XDocument.Load(xr, LoadOptions.PreserveWhitespace);
                return Convert(doc);
            }
        }

        private static ParsedPackageInfo Convert(XDocument doc)
        {
            var requested = new List<string>(256);
            var requestedSeen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var selected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            bool hitMonitorTriad = false;

            foreach (var pi in DescendantsByLocalName(doc.Root, "ProductInstance"))
            {
                var codes = ExtractSignatures(pi);
                if (codes.Count == 0) continue;

                var productTypeNames = ExtractProductTypeNames(pi);
                bool usedMonitorTriad;
                var chosenProductType = ProductTypePicker.ChooseBest(productTypeNames, out usedMonitorTriad);
                if (usedMonitorTriad) hitMonitorTriad = true;

                foreach (var sig in codes)
                {
                    if (requestedSeen.Add(sig))
                        requested.Add(sig);

                    var key = SignatureToSelectedKey(sig);
                    if (key.Length == 0) continue;

                    string existing;
                    if (!selected.TryGetValue(key, out existing))
                        selected[key] = chosenProductType;
                    else
                        selected[key] = ProductTypePicker.PickBetter(existing, chosenProductType);
                }
            }

            var r = new ParsedPackageInfo();
            r.SelectedProductTypes = selected;
            r.RequestedSignatures = requested;
            r.DeviceMetadataCategory = hitMonitorTriad ? "Display.Monitor" : null;
            return r;
        }

        private static IEnumerable<XElement> DescendantsByLocalName(XElement root, string localName)
        {
            if (root == null) yield break;
            foreach (var e in root.Descendants())
                if (e.Name.LocalName == localName)
                    yield return e;
        }

        private static string Attr(XElement el, string name)
        {
            var a = el.Attributes().FirstOrDefault(x => x.Name.LocalName == name);
            return a != null ? (a.Value ?? "") : "";
        }

        private static List<string> ExtractSignatures(XElement productInstance)
        {
            var result = new List<string>(16);

            foreach (var os in productInstance.Descendants().Where(e => e.Name.LocalName == "OperatingSystem"))
            {
                foreach (var code in os.Descendants().Where(e => e.Name.LocalName == "Code"))
                {
                    var name = Attr(code, "Name");
                    if (!string.IsNullOrWhiteSpace(name))
                        result.Add(name.Trim());
                }
            }

            return result;
        }

        private static List<string> ExtractProductTypeNames(XElement productInstance)
        {
            return productInstance.Descendants()
                .Where(e => e.Name.LocalName == "ProductTypes")
                .Descendants()
                .Where(e => e.Name.LocalName == "ProductType")
                .Select(e => Attr(e, "Name"))
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n.Trim())
                .ToList();
        }

        private static string SignatureToSelectedKey(string signature)
        {
            if (string.IsNullOrWhiteSpace(signature)) return string.Empty;

            var parts = signature.Split(new[] { '_' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 5) return string.Empty;

            var ver = parts[1];      // v100
            var channel = parts[parts.Length - 2]; // GE / 25H2 / ...
            return "Windows_" + ver + "_" + channel;
        }

        private static class ProductTypePicker
        {
            private static readonly Regex RxWddm =
                new Regex(@"\bWDDM\s*(\d+(?:\.\d+)*)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

            private static readonly Regex RxMcdm =
                new Regex(@"\bMCDM\s*(\d+(?:\.\d+)*)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

            private static readonly Regex RxBtLevel =
                new Regex(@"\bBluetooth\s+Radio\b.*\bLevel\s*(\d+(?:\.\d+)*)\b",
                    RegexOptions.IgnoreCase | RegexOptions.Compiled);

            private static readonly Regex RxTpm =
                new Regex(@"\bTPM\s*(\d+(?:\.\d+)*)\b|\bTPM(\d+)\b",
                    RegexOptions.IgnoreCase | RegexOptions.Compiled);

            public static string ChooseBest(List<string> names, out bool usedMonitorTriad)
            {
                usedMonitorTriad = false;

                var clean = (names ?? new List<string>())
                    .Select(s => (s ?? "").Trim())
                    .Where(s => s.Length != 0)
                    .ToList();

                if (clean.Count == 0) return Unclassified;

                if (clean.Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1)
                    return clean[0];

                var distinct = clean.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
                if (distinct.Count == 3 &&
                    distinct.All(x =>
                        x.Equals("LCD", StringComparison.OrdinalIgnoreCase) ||
                        x.Equals("Monitor", StringComparison.OrdinalIgnoreCase) ||
                        x.Equals("Projector", StringComparison.OrdinalIgnoreCase)) &&
                    distinct.Any(x => x.Equals("Monitor", StringComparison.OrdinalIgnoreCase)))
                {
                    usedMonitorTriad = true;
                    foreach (var x in clean)
                        if (x.Equals("Monitor", StringComparison.OrdinalIgnoreCase))
                            return x;
                    return "Monitor";
                }

                Parsed best = default(Parsed);
                bool hasBest = false;

                foreach (var n in clean)
                {
                    Parsed? p = Parse(n);
                    if (!p.HasValue) continue;

                    if (!hasBest || Compare(p.Value, best) > 0)
                    {
                        best = p.Value;
                        hasBest = true;
                    }
                }

                if (!hasBest) return clean[0];
                return best.Original;
            }

            public static string PickBetter(string a, string b)
            {
                Parsed? pa = Parse(a);
                Parsed? pb = Parse(b);

                if (!pa.HasValue && !pb.HasValue) return a;
                if (!pa.HasValue) return b;
                if (!pb.HasValue) return a;

                return Compare(pb.Value, pa.Value) > 0 ? b : a;
            }

            private static int Compare(Parsed x, Parsed y)
            {
                int c = x.FamilyRank.CompareTo(y.FamilyRank);
                if (c != 0) return c;

                c = x.Version.CompareTo(y.Version);
                if (c != 0) return c;

                c = x.VariantRank.CompareTo(y.VariantRank);
                if (c != 0) return c;

                return -string.Compare(x.Original, y.Original, StringComparison.OrdinalIgnoreCase);
            }

            private static Parsed? Parse(string name)
            {
                if (string.IsNullOrWhiteSpace(name)) return null;
                name = name.Trim();

                Match m = RxWddm.Match(name);
                VersionTuple vWddm;
                if (m.Success && TryParseDotVersion(m.Groups[1].Value, out vWddm))
                    return new Parsed(name, 500, vWddm, VariantRank(name));

                m = RxMcdm.Match(name);
                VersionTuple vMcdm;
                if (m.Success && TryParseDotVersion(m.Groups[1].Value, out vMcdm))
                    return new Parsed(name, 400, vMcdm, VariantRank(name));

                m = RxBtLevel.Match(name);
                VersionTuple vBt;
                if (m.Success && TryParseDotVersion(m.Groups[1].Value, out vBt))
                    return new Parsed(name, 300, vBt, 0);

                if (name.Equals("Audio Device", StringComparison.OrdinalIgnoreCase) ||
                    name.Equals("Audio Processing Objects", StringComparison.OrdinalIgnoreCase) ||
                    name.StartsWith("Audio ", StringComparison.OrdinalIgnoreCase))
                {
                    return new Parsed(name, 200, VersionTuple.Zero, 0);
                }

                m = RxTpm.Match(name);
                if (m.Success)
                {
                    string token = m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value;
                    VersionTuple vTpm;
                    if (TryParseTpmVersion(token, out vTpm))
                        return new Parsed(name, 100, vTpm, 0);
                }

                return null;
            }

            private static bool TryParseDotVersion(string s, out VersionTuple v)
            {
                v = default(VersionTuple);
                var parts = (s ?? "").Split(new[] { '.' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 0) return false;

                int len = Math.Min(parts.Length, 4);
                int[] nums = new int[len];

                for (int i = 0; i < len; i++)
                    if (!int.TryParse(parts[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out nums[i]))
                        return false;

                v = new VersionTuple(
                    len > 0 ? nums[0] : 0,
                    len > 1 ? nums[1] : 0,
                    len > 2 ? nums[2] : 0,
                    len > 3 ? nums[3] : 0);

                return true;
            }

            private static bool TryParseTpmVersion(string token, out VersionTuple v)
            {
                v = default(VersionTuple);

                if (string.IsNullOrWhiteSpace(token)) return false;
                token = token.Trim();

                if (token.Contains(".") && TryParseDotVersion(token, out v))
                    return true;

                if (token.Length == 2 && char.IsDigit(token[0]) && char.IsDigit(token[1]))
                {
                    v = new VersionTuple(token[0] - '0', token[1] - '0', 0, 0);
                    return true;
                }

                return false;
            }

            private static int VariantRank(string name)
            {
                string Norm(string s)
                {
                    var chars = s.Where(ch => ch != ' ' && ch != '_' && ch != '-').ToArray();
                    return new string(chars);
                }

                string n = Norm(name);

                bool isVm = n.IndexOf("VM", StringComparison.OrdinalIgnoreCase) >= 0;

                bool isDisplayOnly =
                    n.IndexOf("DisplayOnly", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (n.IndexOf("Display", StringComparison.OrdinalIgnoreCase) >= 0 &&
                     n.IndexOf("Only", StringComparison.OrdinalIgnoreCase) >= 0);

                bool isRenderOnly =
                    n.IndexOf("RenderOnly", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    (n.IndexOf("Render", StringComparison.OrdinalIgnoreCase) >= 0 &&
                     n.IndexOf("Only", StringComparison.OrdinalIgnoreCase) >= 0);

                if (!isVm && !isDisplayOnly && !isRenderOnly) return 40;
                if (isDisplayOnly && !isVm && !isRenderOnly) return 30;
                if (isRenderOnly && !isVm && !isDisplayOnly) return 20;
                if (isVm && !isDisplayOnly && !isRenderOnly) return 10;

                return 5;
            }

            private struct Parsed
            {
                public string Original;
                public int FamilyRank;
                public VersionTuple Version;
                public int VariantRank;

                public Parsed(string original, int familyRank, VersionTuple version, int variantRank)
                {
                    Original = original;
                    FamilyRank = familyRank;
                    Version = version;
                    VariantRank = variantRank;
                }
            }

            private struct VersionTuple : IComparable<VersionTuple>
            {
                public int Major;
                public int Minor;
                public int Build;
                public int Rev;

                public static readonly VersionTuple Zero = new VersionTuple(0, 0, 0, 0);

                public VersionTuple(int major, int minor, int build, int rev)
                {
                    Major = major;
                    Minor = minor;
                    Build = build;
                    Rev = rev;
                }

                public int CompareTo(VersionTuple other)
                {
                    int c = Major.CompareTo(other.Major); if (c != 0) return c;
                    c = Minor.CompareTo(other.Minor); if (c != 0) return c;
                    c = Build.CompareTo(other.Build); if (c != 0) return c;
                    return Rev.CompareTo(other.Rev);
                }
            }
        }
    }
}
