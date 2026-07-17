import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCredential, saveCredential } from '../../src/config/credentials.js'

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'wu-')), 'credential.enc')
}
const M = 'test-material'

describe('credentials', () => {
  it('missing file yields empty credential', () => {
    expect(loadCredential(tmpFile(), M)).toEqual({ tenantId: '', clientId: '', clientSecret: '' })
  })
  it('round-trips encrypted', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, p, M)
    expect(loadCredential(p, M)).toEqual({ tenantId: 't', clientId: 'c', clientSecret: 's' })
  })
  it('wrong material yields empty credential (no throw)', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, p, M)
    expect(loadCredential(p, 'other')).toEqual({ tenantId: '', clientId: '', clientSecret: '' })
  })
  it('stored file is not plaintext', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 'super-secret' }, p, M)
    const raw = readFileSync(p, 'utf8')
    expect(raw).not.toContain('super-secret')
  })
})
