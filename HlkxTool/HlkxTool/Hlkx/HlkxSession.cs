using System;
using System.IO;
using System.IO.Packaging;
using System.Linq;

namespace HlkxTool.Hlkx
{
    internal sealed class HlkxSession : IDisposable
    {
        private readonly Package _package;

        public HlkxSession(string hlkxPath)
        {
            _package = Package.Open(hlkxPath, FileMode.Open, FileAccess.Read);
        }

        public SignatureStatus ReadSignatureStatus(bool verifyCryptographically)
        {
            bool hasRel = _package.GetRelationshipsByType(HlkxConstants.DigitalSignatureOriginRelType).Any();
            bool hasSigParts = _package.GetParts().Any(p =>
                p.Uri.OriginalString.StartsWith(HlkxConstants.SignaturePartsPrefix, StringComparison.OrdinalIgnoreCase));

            bool hasStructure = hasRel || hasSigParts;

            bool? isSigned = null;
            string verify = null;
            Exception error = null;

            try
            {
                var dsm = new PackageDigitalSignatureManager(_package);
                isSigned = dsm.IsSigned;

                if (verifyCryptographically && dsm.IsSigned)
                {
                    var vr = dsm.VerifySignatures(false);
                    verify = vr.ToString();
                }
            }
            catch (Exception ex)
            {
                error = ex;
            }

            return new SignatureStatus(hasStructure, isSigned, verify, error);
        }

        public Stream TryOpenPartStream(string partRelativePath)
        {
            var partUri = PackUriHelper.CreatePartUri(new Uri(Normalize(partRelativePath), UriKind.Relative));
            if (!_package.PartExists(partUri)) return null;
            return _package.GetPart(partUri).GetStream(FileMode.Open, FileAccess.Read);
        }

        private static string Normalize(string path)
        {
            string p = (path ?? "").Trim().TrimStart('/').Replace('\\', '/');
            if (p.Length == 0) throw new ArgumentException("part path 不能为空");
            return p;
        }

        public void Dispose()
        {
            _package.Close();
        }
    }
}
