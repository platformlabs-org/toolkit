import { homedir } from 'node:os'
import { join } from 'node:path'

export function wuDir(): string {
  return join(homedir(), '.wu')
}
export function configPath(): string {
  return join(wuDir(), 'config.json')
}
export function credentialPath(): string {
  return join(wuDir(), 'credential.enc')
}
