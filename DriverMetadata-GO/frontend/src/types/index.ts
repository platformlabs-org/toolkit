export interface DriverInfo {
    deviceName: string;
    version: string;
    manufacturer: string;
    infName: string;
    catalogPath: string;
    pnpDeviceId: string;
    signedDriverHardwareId: string;
    hardwareIds: string[];
    compatibleIds: string[];
    rawMatchedHardwareId: string;
    displayMatchedHardwareId: string;
    metadata: { [key: string]: string };
}
