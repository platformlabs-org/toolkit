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

export type SortKey = 'deviceName' | 'version' | 'displayMatchedHardwareId' | 'infName';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
    key: SortKey;
    direction: SortDirection;
}
