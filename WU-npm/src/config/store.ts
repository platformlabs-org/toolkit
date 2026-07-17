import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { configPath } from './paths.js'

export interface WuConfig {
  msContact: string
  validationsPerformed: string
  affectedOems: string[]
  businessJustification: string
  destination: string
  goLiveImmediate: boolean
  autoInstallDuringOSUpgrade: boolean
  autoInstallOnApplicableSystems: boolean
  isDisclosureRestricted: boolean
  publishToWindows10s: boolean
  isRebootRequired: boolean
  isCoEngineered: boolean
  isForUnreleasedHardware: boolean
  hasUiSoftware: boolean
  visibleToAccounts: number[]
}

export const DEFAULT_CONFIG: WuConfig = {
  msContact: 'feizh@microsoft.com',
  validationsPerformed: 'Product assurance team full range tested',
  affectedOems: ['N/A'],
  businessJustification: 'to meet MDA requirements',
  destination: 'windowsUpdate',
  goLiveImmediate: true,
  autoInstallDuringOSUpgrade: true,
  autoInstallOnApplicableSystems: true,
  isDisclosureRestricted: false,
  publishToWindows10s: false,
  isRebootRequired: false,
  isCoEngineered: false,
  isForUnreleasedHardware: false,
  hasUiSoftware: false,
  visibleToAccounts: [],
}

export function loadConfig(path: string = configPath()): WuConfig {
  if (!existsSync(path)) {
    try {
      saveConfig(DEFAULT_CONFIG, path)
    } catch {
      // best-effort persistence; ignore write errors
    }
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<WuConfig>
    return { ...DEFAULT_CONFIG, ...raw }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: WuConfig, path: string = configPath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2))
}
