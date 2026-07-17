import type { CLIOptions } from '../cli/options.js'
import type { HardwareTarget } from '../drivermeta/types.js'
import { APIError } from '../support/errors.js'
import { or } from '../support/strings.js'

export function buildPayload(
  opt: CLIOptions,
  name: string,
  targets: HardwareTarget[],
  chids: string[],
): Record<string, any> {
  if (chids.length === 0) throw new APIError('CHIDs 必须至少提供 1 个（必填）。')

  const publishing: Record<string, any> = {
    goLiveDate: opt.goLiveImmediate ? '' : or(opt.goLiveDate, ''),
    visibleToAccounts: opt.visibleToAccounts,
    isAutoInstallDuringOSUpgrade: opt.autoInstallDuringOSUpgrade,
    isAutoInstallOnApplicableSystems: opt.autoInstallOnApplicableSystems,
    manualAcquisition: !opt.autoInstallDuringOSUpgrade && !opt.autoInstallOnApplicableSystems,
    isDisclosureRestricted: opt.isDisclosureRestricted,
    publishToWindows10s: opt.publishToWindows10s,
  }

  if (opt.autoInstallDuringOSUpgrade || opt.autoInstallOnApplicableSystems) {
    publishing.additionalInfoForMsApproval = {
      microsoftContact: opt.msContact,
      validationsPerformed: opt.validationsPerformed,
      affectedOems: opt.affectedOems,
      isRebootRequired: opt.isRebootRequired,
      isCoEngineered: opt.isCoEngineered,
      isForUnreleasedHardware: opt.isForUnreleasedHardware,
      hasUiSoftware: opt.hasUiSoftware,
      businessJustification: opt.businessJustification,
    }
  }

  const hardwareIds = targets.map((t) => ({
    bundleId: t.bundleId,
    infId: t.infId,
    operatingSystemCode: t.osCode,
    pnpString: t.pnpId,
  }))

  const chidArr = chids.map((c) => ({ chid: c, distributionState: 'pendingAdd' }))

  return {
    publishingSpecifications: publishing,
    targeting: { hardwareIds, chids: chidArr },
    name,
    destination: opt.destination,
  }
}
