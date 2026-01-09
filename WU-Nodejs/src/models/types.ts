export type Credential = {
  TenantId: string;
  ClientId: string;
  ClientSecret: string;

  MsContact?: string;
  ValidationsPerformed?: string;
  AffectedOems?: string[];
  BusinessJustification?: string;
};

export type Options = {
  TenantId?: string | null;
  ClientId?: string | null;
  ClientSecret?: string | null;
  ProductId?: string | null;
  SubmissionId?: string | null;

  SelectAll: boolean;
  DryRun: boolean;
  OutPath: string;

  Destination: string;
  Name?: string | null;

  GoLiveImmediate: boolean;
  GoLiveDate?: string | null;

  VisibleToAccounts: number[];

  AutoInstallDuringOsUpgrade: boolean;
  AutoInstallOnApplicableSystems: boolean;

  IsDisclosureRestricted: boolean;
  PublishToWindows10s: boolean;

  MsContact: string;
  ValidationsPerformed: string;
  AffectedOems: string[];
  IsRebootRequired: boolean;
  IsCoEngineered: boolean;
  IsForUnreleasedHardware: boolean;
  HasUiSoftware: boolean;
  BusinessJustification: string;

  Chids: string[];

  NoUi: boolean;
  OfferFilter: boolean;
};

export type HwidCandidate = {
  BundleId: string;
  BundleTag: string;
  InfId: string;
  OperatingSystemCode: string;
  PnpString: string;
  Manufacturer?: string | null;
  DeviceDescription?: string | null;
};

export type UiLegend = {
  bundleId: string;
  tag: string;
  itemCount: number;
  sampleInfs: string[];
};

export type UiMapping = {
  bundleTagById: Map<string, string>;
  bundleColorById: Map<string, (s: string) => string>;
  legends: UiLegend[];
};
