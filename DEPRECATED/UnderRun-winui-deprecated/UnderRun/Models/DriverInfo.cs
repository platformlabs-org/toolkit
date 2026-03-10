using System;

namespace UnderRun.Models;

public class DriverInfo
{
    public string Name { get; }
    public string Description { get; }
    public string Provider { get; }
    public Version Version { get; }
    public DateTime InstallDate { get; }
    public string InfName { get; }
    public bool IsSigned { get; }
    public bool IsEnabled { get; }
    public string DeviceId { get; }
    public string ClassGuid { get; }
    public string DeviceClass { get; }

    public DriverInfo(string name, string description, string provider, Version version, DateTime installDate, string infName, bool isSigned, bool isEnabled, string deviceId, string classGuid, string deviceClass)
    {
        Name = name;
        Description = description;
        Provider = provider;
        Version = version;
        InstallDate = installDate;
        InfName = infName;
        IsSigned = isSigned;
        IsEnabled = isEnabled;
        DeviceId = deviceId;
        ClassGuid = classGuid;
        DeviceClass = deviceClass;
    }
}
