import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCredential, saveCredential } from '../../src/config/credentials.js'

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'wu-')), 'credential.enc')
}
const M = 'test-material'
const EMPTY = { tenantId: '', clientId: '', clientSecret: '', msContact: '' }

describe('credentials', () => {
  it('missing file yields empty credential', () => {
    expect(loadCredential(tmpFile(), M)).toEqual(EMPTY)
  })
  it('round-trips encrypted, including msContact', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's', msContact: 'me@corp.com' }, p, M)
    expect(loadCredential(p, M)).toEqual({ tenantId: 't', clientId: 'c', clientSecret: 's', msContact: 'me@corp.com' })
  })
  it('wrong material yields empty credential (no throw)', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's', msContact: 'me@corp.com' }, p, M)
    expect(loadCredential(p, 'other')).toEqual(EMPTY)
  })
  it('stored file exposes neither the secret nor msContact in plaintext', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 'super-secret', msContact: 'me@corp.com' }, p, M)
    const raw = readFileSync(p, 'utf8')
    expect(raw).not.toContain('super-secret')
    expect(raw).not.toContain('me@corp.com')
  })
})
