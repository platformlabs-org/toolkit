import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { credentialPath } from './paths.js'
import { encrypt, decrypt, machineMaterial, type EncBlob } from './crypto.js'

export interface Credential {
  tenantId: string
  clientId: string
  clientSecret: string
}

const EMPTY: Credential = { tenantId: '', clientId: '', clientSecret: '' }

export function loadCredential(
  path: string = credentialPath(),
  material: string = machineMaterial(),
): Credential {
  if (!existsSync(path)) return { ...EMPTY }
  try {
    const blob = JSON.parse(readFileSync(path, 'utf8')) as EncBlob
    const plain = decrypt(blob, material)
    const obj = JSON.parse(plain) as Partial<Credential>
    return {
      tenantId: obj.tenantId ?? '',
      clientId: obj.clientId ?? '',
      clientSecret: obj.clientSecret ?? '',
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveCredential(
  cred: Credential,
  path: string = credentialPath(),
  material: string = machineMaterial(),
): void {
  mkdirSync(dirname(path), { recursive: true })
  const blob = encrypt(JSON.stringify(cred), material)
  writeFileSync(path, JSON.stringify(blob, null, 2))
}
