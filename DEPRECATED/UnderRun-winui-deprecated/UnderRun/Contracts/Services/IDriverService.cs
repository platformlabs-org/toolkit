using System.Collections.Generic;
using System.Threading.Tasks;
using UnderRun.Models;

namespace UnderRun.Contracts.Services;

public interface IDriverService
{
    Task<IEnumerable<DriverInfo>> GetAllDriversAsync();
    Task<DriverInfo?> GetDriverByNameAsync(string driverName);
    Task<DriverInfo?> GetDriverByDeviceIdAsync(string deviceId);
    Task<DriverInfo?> GetIntelIGPUDriverAsync();
    Task<DriverSignatureInfo> GetDriverSignatureInfoAsync(string driverName);
}
