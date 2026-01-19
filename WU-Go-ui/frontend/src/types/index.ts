export interface Credential {
    TenantId: string;
    ClientId: string;
    ClientSecret: string;
    MsContact?: string;
    ValidationsPerformed?: string;
    AffectedOems?: string[];
    BusinessJustification?: string;
}

export interface HardwareTarget {
    bundleId: string;
    bundleTag: string;
    infId: string;
    osCode: string;
    pnpId: string;
    manufacturer: string;
    deviceDescription: string;
}

export interface ParseResult {
    targets: HardwareTarget[];
}

export interface LabelOptions {
    destination: string;
    goLiveImmediate: boolean;
    goLiveDate: string;
    visibleToAccounts: number[];
    autoInstallDuringOSUpgrade: boolean;
    autoInstallOnApplicableSystems: boolean;
    isDisclosureRestricted: boolean;
    publishToWindows10s: boolean;

    msContact: string;
    validationsPerformed: string;
    affectedOems: string[];
    isRebootRequired: boolean;
    isCoEngineered: boolean;
    isForUnreleasedHardware: boolean;
    hasUiSoftware: boolean;
    businessJustification: string;
}

export interface Submission {
    id: string;
    productId: string;
    name?: string;
    [key: string]: any;
}
