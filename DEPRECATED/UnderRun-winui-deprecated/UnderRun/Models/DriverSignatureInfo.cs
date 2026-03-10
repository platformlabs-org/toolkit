using System;

namespace UnderRun.Models;

public record DriverSignatureInfo(bool IsSigned, string? Signer, DateTime SigningDate, string? Thumbprint);
