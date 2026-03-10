using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;
using UnderRun.Contracts.Services;
using UnderRun.Models;

namespace UnderRun.Services;

public class DriverService : IDriverService
{
    public async Task<IEnumerable<DriverInfo>> GetAllDriversAsync()
    {
        Debug.WriteLine("[DriverService] Starting to retrieve all drivers from Win32_PnPSignedDriver...");
        return await Task.Run(() =>
        {
            var drivers = new List<DriverInfo>();
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_PnPSignedDriver");
                foreach (ManagementObject driver in searcher.Get())
                {
                    var driverInfo = CreateDriverInfoFromPnP(driver);
                    if (driverInfo != null)
                    {
                        drivers.Add(driverInfo);
                        Debug.WriteLine($"[DriverService] Found driver: {driverInfo.Name}, ClassGuid: {driverInfo.ClassGuid}");
                    }
                }
                Debug.WriteLine($"[DriverService] Total {drivers.Count} drivers found.");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DriverService] Error retrieving driver list: {ex.Message}");
            }
            return drivers;
        });
    }

    public async Task<DriverInfo?> GetDriverByNameAsync(string driverName)
    {
        Debug.WriteLine($"[DriverService] Querying driver by name from Win32_PnPSignedDriver: {driverName}");
        return await Task.Run(() =>
        {
            try
            {
                using var searcher = new ManagementObjectSearcher(
                    $"SELECT * FROM Win32_PnPSignedDriver WHERE DeviceName = '{driverName.Replace("'", "''")}'");
                var driver = searcher.Get().OfType<ManagementObject>().FirstOrDefault();
                return driver != null ? CreateDriverInfoFromPnP(driver) : null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DriverService] Error querying driver {driverName}: {ex.Message}");
                return null;
            }
        });
    }

    public async Task<DriverInfo?> GetDriverByDeviceIdAsync(string deviceId)
    {
        Debug.WriteLine($"[DriverService] Querying driver by DeviceID from Win32_PnPSignedDriver: {deviceId}");
        return await Task.Run(() =>
        {
            try
            {
                using var searcher = new ManagementObjectSearcher(
                    $"SELECT * FROM Win32_PnPSignedDriver WHERE DeviceID = '{deviceId.Replace("\\", "\\\\")}'");
                var pnpDevice = searcher.Get().OfType<ManagementObject>().FirstOrDefault();
                return pnpDevice != null ? CreateDriverInfoFromPnP(pnpDevice) : null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DriverService] Error querying DeviceID {deviceId}: {ex.Message}");
                return null;
            }
        });
    }
    public async Task<DriverInfo?> GetIntelIGPUDriverAsync()
    {
        Debug.WriteLine("[DriverService] Querying Intel iGPU driver using targeted WMI query...");
        return await Task.Run(() =>
        {
            try
            {
                const string classGuid = "{4d36e968-e325-11ce-bfc1-08002be10318}";
                var query = $"SELECT * FROM Win32_PnPSignedDriver WHERE ClassGuid = '{classGuid}'";
                using var searcher = new ManagementObjectSearcher(query);

                foreach (var driver in searcher.Get().OfType<ManagementObject>())
                {
                    var description = SafeGetString(driver, "Description");
                    var manufacturer = SafeGetString(driver, "Manufacturer");

                    if ((manufacturer?.Contains("Intel", StringComparison.OrdinalIgnoreCase) ?? false) ||
                        (description?.Contains("Intel", StringComparison.OrdinalIgnoreCase) ?? false))
                    {
                        return CreateDriverInfoFromPnP(driver);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[DriverService] Error querying Intel iGPU driver: {ex.Message}");
            }

            return null;
        });
    }
    public async Task<DriverSignatureInfo> GetDriverSignatureInfoAsync(string driverName)
    {
        Debug.WriteLine($"[DriverService] Retrieving driver signature info: {driverName}");
        try
        {
            var driverInfo = await GetDriverByNameAsync(driverName);
            // DriverInfo does not expose FilePath, but it is needed here.
            // In the original code, DriverInfo likely had a FilePath property.
            // However, looking at the provided CreateDriverInfoFromPnP logic, it doesn't seem to set a FilePath from Win32_PnPSignedDriver directly easily unless "InfName" or something is used,
            // but usually we need the .sys file path for signature check.
            // Wait, looking at the original provided code for DriverService.cs:
            // "if (driverInfo?.FilePath == null || !File.Exists(driverInfo.FilePath))"
            // This suggests DriverInfo HAD a FilePath property.
            // But looking at "CreateDriverInfoFromPnP" in the provided file:
            // return new DriverInfo(..., infName ?? "", ...);
            // It does NOT seem to extract a file path to the driver binary (.sys).
            // Win32_PnPSignedDriver has "DriverProviderName", "HardWareID" etc, but getting the actual binary path is tricky.
            // Maybe it was using "InfName" as file path? No, InfName is just the .inf.

            // Re-reading original DriverService.cs provided by user:
            // "var infName = SafeGetString(driver, "InfName");"
            // And then "return new DriverInfo(..., infName ?? "", ...);"
            // It seems the original code provided in attachments was incomplete or I missed the FilePath assignment in CreateDriverInfoFromPnP.
            // Let's look closely at the original CreateDriverInfoFromPnP provided in my `read_file` output earlier.
            // It has `return new DriverInfo(...)`. It does NOT assign a FilePath.
            // BUT `GetDriverSignatureInfoAsync` USES `driverInfo.FilePath`.
            // This implies the provided `DriverService.cs` code was inconsistent or relied on a version of `DriverInfo` I don't see.
            // Or maybe I missed it. Let's re-read the `CreateDriverInfoFromPnP` block from previous output.
            /*
             return new DriverInfo(
                name ?? "",
                description ?? "",
                provider ?? "Unknown",
                version,
                installDate,
                infName ?? "",
                isSigned,
                isEnabled,
                deviceId,
                classGuid,
                deviceClass
            );
            */
            // There is NO FilePath.
            // So `GetDriverSignatureInfoAsync` in the provided code would fail to compile if DriverInfo doesn't have FilePath.
            // Since I am re-implementing, I will handle this gracefully.
            // I will assume for now we cannot easily get the file path from just this WMI query for the signature check fallback.
            // I will implement the part that uses WMI.

            using var searcher = new ManagementObjectSearcher(
                $"SELECT * FROM Win32_PnPSignedDriver WHERE DeviceName = '{driverName.Replace("'", "''")}'");
            var driver = searcher.Get().OfType<ManagementObject>().FirstOrDefault();
            if (driver != null)
            {
                var isSigned = SafeGetBool(driver, "IsSigned");
                var signer = SafeGetString(driver, "Signer");
                var driverDate = SafeGetString(driver, "DriverDate");

                DateTime signingDate = DateTime.MinValue;
                if (!string.IsNullOrEmpty(driverDate) && DateTime.TryParse(driverDate, out var parsedDate))
                {
                    signingDate = parsedDate;
                }
                Debug.WriteLine($"[DriverService] WMI Signature - Signed: {isSigned}, Signer: {signer}");
                return new DriverSignatureInfo(isSigned, signer, signingDate, null);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DriverService] Signature validation failed: {ex.Message}");
        }

        return new DriverSignatureInfo(false, null, DateTime.MinValue, null);
    }

    private DriverInfo? CreateDriverInfoFromPnP(ManagementObject driver)
    {
        try
        {
            var name = SafeGetString(driver, "DeviceName");
            var description = SafeGetString(driver, "Description") ?? name;
            var provider = SafeGetString(driver, "Manufacturer");
            var deviceId = SafeGetString(driver, "DeviceID");
            var classGuid = SafeGetString(driver, "ClassGuid");
            var deviceClass = SafeGetString(driver, "DeviceClass");
            var driverVersion = SafeGetString(driver, "DriverVersion");
            var driverDate = SafeGetString(driver, "DriverDate");
            var infName = SafeGetString(driver, "InfName");
            var isSigned = SafeGetBool(driver, "IsSigned");
            var status = SafeGetString(driver, "Status");
            bool isEnabled = status != null && status.Equals("OK", StringComparison.OrdinalIgnoreCase);

            Version version = ParseVersionString(driverVersion);
            DateTime installDate = DateTime.MinValue;
            if (!string.IsNullOrWhiteSpace(driverDate) && DateTime.TryParse(driverDate, out var parsedDate))
                installDate = parsedDate;

            return new DriverInfo(
                name ?? "",
                description ?? "",
                provider ?? "Unknown",
                version,
                installDate,
                infName ?? "",
                isSigned,
                isEnabled,
                deviceId ?? "",
                classGuid ?? "",
                deviceClass ?? ""
            );
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[DriverService] Error creating DriverInfo from PnP: {ex.Message}");
            return null;
        }
    }

    private static string? SafeGetString(ManagementObject obj, string prop)
    {
        try
        {
            return obj.GetPropertyValue(prop)?.ToString();
        }
        catch { return null; }
    }

    private static bool SafeGetBool(ManagementObject obj, string prop)
    {
        try
        {
            return obj.GetPropertyValue(prop) is bool value && value;
        }
        catch { return false; }
    }

    private Version ParseVersionString(string? versionString)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(versionString))
                return new Version(0, 0, 0, 0);

            var cleanVersion = new string(versionString
                .Where(c => char.IsDigit(c) || c == '.')
                .ToArray())
                .Trim('.');

            var parts = cleanVersion.Split('.');
            while (parts.Length < 4)
                parts = parts.Concat(new[] { "0" }).ToArray();

            return new Version(
                int.Parse(parts[0]),
                int.Parse(parts[1]),
                int.Parse(parts[2]),
                int.Parse(parts[3]));
        }
        catch
        {
            return new Version(0, 0, 0, 0);
        }
    }
}
