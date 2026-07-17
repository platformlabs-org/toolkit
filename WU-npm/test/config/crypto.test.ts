import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../src/config/crypto.js'

describe('crypto', () => {
  it('round-trips with same material', () => {
    const blob = encrypt('secret-value', 'material-A')
    expect(decrypt(blob, 'material-A')).toBe('secret-value')
  })
  it('fails with different material', () => {
    const blob = encrypt('secret-value', 'material-A')
    expect(() => decrypt(blob, 'material-B')).toThrow()
  })
  it('produces base64 fields and version', () => {
    const blob = encrypt('x', 'm')
    expect(blob.v).toBe(1)
    expect(typeof blob.salt).toBe('string')
    expect(typeof blob.data).toBe('string')
  })
})
