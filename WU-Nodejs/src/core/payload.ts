import { ApiException } from "../api/http";
import { Options, HwidCandidate } from "../models/types";

export function buildShippingLabelPayload(opt: Options, name: string, hwids: HwidCandidate[], chids: string[]) {
  if (!chids || chids.length === 0) throw new ApiException("CHIDs 必须至少提供 1 个（必填）。");

  const publishing: any = {
    goLiveDate: opt.GoLiveImmediate ? "" : (opt.GoLiveDate ?? ""),
    visibleToAccounts: opt.VisibleToAccounts,
    isAutoInstallDuringOSUpgrade: opt.AutoInstallDuringOsUpgrade,
    isAutoInstallOnApplicableSystems: opt.AutoInstallOnApplicableSystems,
    manualAcquisition: (!opt.AutoInstallDuringOsUpgrade && !opt.AutoInstallOnApplicableSystems),
    isDisclosureRestricted: opt.IsDisclosureRestricted,
    publishToWindows10s: opt.PublishToWindows10s,
  };

  if (opt.AutoInstallDuringOsUpgrade || opt.AutoInstallOnApplicableSystems) {
    publishing.additionalInfoForMsApproval = {
      microsoftContact: opt.MsContact,
      validationsPerformed: opt.ValidationsPerformed,
      affectedOems: opt.AffectedOems,
      isRebootRequired: opt.IsRebootRequired,
      isCoEngineered: opt.IsCoEngineered,
      isForUnreleasedHardware: opt.IsForUnreleasedHardware,
      hasUiSoftware: opt.HasUiSoftware,
      businessJustification: opt.BusinessJustification,
    };
  }

  const hardwareIds = hwids.map(h => ({
    bundleId: h.BundleId,
    infId: h.InfId,
    operatingSystemCode: h.OperatingSystemCode,
    pnpString: h.PnpString,
  }));

  const chidArr = chids.map(c => ({
    chid: c,
    distributionState: "pendingAdd",
  }));

  return {
    publishingSpecifications: publishing,
    targeting: {
      hardwareIds,
      chids: chidArr,
    },
    name,
    destination: opt.Destination,
  };
}
