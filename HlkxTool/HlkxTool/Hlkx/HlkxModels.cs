using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace HlkxTool.Hlkx
{
    internal static class HlkxConstants
    {
        public const string PackageInfoPartPath = "hck/data/PackageInfo.xml";

        public const string DigitalSignatureOriginRelType =
            "http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin";

        public const string SignaturePartsPrefix = "/package/services/digital-signature/";
    }

    public sealed class ParsedPackageInfo
    {
        [JsonPropertyName("selectedProductTypes")]
        public Dictionary<string, string> SelectedProductTypes { get; set; }

        [JsonPropertyName("requestedSignatures")]
        public List<string> RequestedSignatures { get; set; }

        [JsonPropertyName("deviceMetadataCategory")]
        public string DeviceMetadataCategory { get; set; }

        public ParsedPackageInfo()
        {
            SelectedProductTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            RequestedSignatures = new List<string>();
            DeviceMetadataCategory = null;
        }
    }

    internal struct SignatureStatus
    {
        public bool HasSignatureStructure;
        public bool? IsSigned;
        public string VerifyResultText;
        public Exception Error;

        public SignatureStatus(bool hasStructure, bool? isSigned, string verifyText, Exception error)
        {
            HasSignatureStructure = hasStructure;
            IsSigned = isSigned;
            VerifyResultText = verifyText;
            Error = error;
        }

        public bool ConsideredSigned
        {
            get { return (IsSigned == true) || (!IsSigned.HasValue && HasSignatureStructure); }
        }
    }

    internal sealed class HlkxAnalysisResult
    {
        public string HlkxPath { get; private set; }
        public SignatureStatus Signature { get; private set; }
        public ParsedPackageInfo PackageInfo { get; private set; }

        public HlkxAnalysisResult(string path, SignatureStatus sig, ParsedPackageInfo info)
        {
            HlkxPath = path;
            Signature = sig;
            PackageInfo = info;
        }
    }
}
