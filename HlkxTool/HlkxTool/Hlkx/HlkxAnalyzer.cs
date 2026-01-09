using System;
using System.IO;
using HlkxTool.Core;
using HlkxTool.HlkxParsing;

namespace HlkxTool.Hlkx
{
    internal sealed class HlkxAnalyzer
    {
        public HlkxAnalysisResult Parse(
            string hlkxPath,
            bool verifySignatures,
            bool parsePackageInfo)
        {
            if (string.IsNullOrWhiteSpace(hlkxPath))
                throw new ArgumentException("hlkxPath 为空");

            if (!File.Exists(hlkxPath))
                throw new FileNotFoundException("文件不存在: " + hlkxPath);

            //using (Log.Time("HlkxParse", "Parsing HLKX: " + hlkxPath))
            using (var session = new HlkxSession(hlkxPath))
            {
                SignatureStatus signature = session.ReadSignatureStatus(verifySignatures);

                if (!parsePackageInfo)
                {
                    return new HlkxAnalysisResult(hlkxPath, signature, new ParsedPackageInfo());
                }

                using (var xmlStream = session.TryOpenPartStream(HlkxConstants.PackageInfoPartPath))
                {
                    if (xmlStream == null)
                        throw new FileNotFoundException("未找到 Part: /" + HlkxConstants.PackageInfoPartPath);

                    ParsedPackageInfo parsed = PackageInfoConverter.Convert(xmlStream);
                    return new HlkxAnalysisResult(hlkxPath, signature, parsed);
                }
            }
        }
    }
}
