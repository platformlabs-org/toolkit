import { parseArgs, type ArgSet } from './args.js'
import type { WuConfig } from '../config/store.js'
import { firstNonEmpty, isBlank } from '../support/strings.js'
import { APIError } from '../support/errors.js'

export interface CLIOptions {
  tenantId: string
  clientId: string
  clientSecret: string
  productId: string
  submissionId: string
  selectAll: boolean
  dryRun: boolean
  outPath: string
  destination: string
  name: string
  goLiveImmediate: boolean
  goLiveDate: string
  visibleToAccounts: number[]
  autoInstallDuringOSUpgrade: boolean
  autoInstallOnApplicableSystems: boolean
  isDisclosureRestricted: boolean
  publishToWindows10s: boolean
  msContact: string
  validationsPerformed: string
  affectedOems: string[]
  isRebootRequired: boolean
  isCoEngineered: boolean
  isForUnreleasedHardware: boolean
  hasUiSoftware: boolean
  businessJustification: string
  chids: string[]
  noUi: boolean
  offerFilter: boolean
}

function parseIntStrict(s: string): number {
  if (!/^[+-]?\d+$/.test(s.trim())) throw new APIError('--visible-to-accounts 需要整数，但输入为: ' + s)
  return parseInt(s, 10)
}

export function assembleOptions(config: WuConfig, argv: string[]): CLIOptions {
  const m: ArgSet = parseArgs(argv)

  const goLiveDate = m.getSingle('--go-live-date')
  let goLiveImmediate = config.goLiveImmediate && !m.hasFlag('--schedule-go-live')
  if (!isBlank(goLiveDate)) goLiveImmediate = false

  let autoOsUpgrade = config.autoInstallDuringOSUpgrade
  if (m.hasFlag('--auto-install-os-upgrade')) autoOsUpgrade = true
  if (m.hasFlag('--no-auto-install-os-upgrade')) autoOsUpgrade = false

  let autoApplicable = config.autoInstallOnApplicableSystems
  if (m.hasFlag('--auto-install-applicable')) autoApplicable = true
  if (m.hasFlag('--no-auto-install-applicable')) autoApplicable = false

  const vtaCli = m.getMany('--visible-to-accounts')
  const visibleToAccounts = vtaCli.length > 0 ? vtaCli.map(parseIntStrict) : [...config.visibleToAccounts]

  const oemsCli = m.getMany('--affected-oems')
  const affectedOems = oemsCli.length > 0 ? [...oemsCli] : [...config.affectedOems]

  return {
    tenantId: m.getSingle('--tenant-id'),
    clientId: m.getSingle('--client-id'),
    clientSecret: m.getSingle('--client-secret'),
    productId: m.getSingle('--product-id'),
    submissionId: m.getSingle('--submission-id'),
    selectAll: m.hasFlag('--select-all'),
    dryRun: m.hasFlag('--dry-run'),
    outPath: firstNonEmpty(m.getSingle('--out'), 'shippinglabel.request.json'),
    destination: firstNonEmpty(m.getSingle('--destination'), config.destination),
    name: m.getSingle('--name'),
    goLiveImmediate,
    goLiveDate: isBlank(goLiveDate) ? '' : goLiveDate,
    visibleToAccounts,
    autoInstallDuringOSUpgrade: autoOsUpgrade,
    autoInstallOnApplicableSystems: autoApplicable,
    isDisclosureRestricted: m.hasFlag('--is-disclosure-restricted') || config.isDisclosureRestricted,
    publishToWindows10s: m.hasFlag('--publish-to-windows10s') || config.publishToWindows10s,
    msContact: firstNonEmpty(m.getSingle('--ms-contact'), config.msContact),
    validationsPerformed: firstNonEmpty(m.getSingle('--validations-performed'), config.validationsPerformed),
    affectedOems,
    isRebootRequired: m.hasFlag('--is-reboot-required') || config.isRebootRequired,
    isCoEngineered: m.hasFlag('--is-co-engineered') || config.isCoEngineered,
    isForUnreleasedHardware: m.hasFlag('--is-for-unreleased-hardware') || config.isForUnreleasedHardware,
    hasUiSoftware: m.hasFlag('--has-ui-software') || config.hasUiSoftware,
    businessJustification: firstNonEmpty(m.getSingle('--business-justification'), config.businessJustification),
    chids: [...m.getMany('--chids')],
    noUi: m.hasFlag('--no-ui'),
    offerFilter: !m.hasFlag('--no-filter'),
  }
}
