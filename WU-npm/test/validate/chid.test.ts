import { describe, it, expect } from 'vitest'
import { normalizeCHIDsRequired } from '../../src/validate/chid.js'
import { APIError } from '../../src/support/errors.js'

const G = '12345678-1234-1234-1234-123456789abc'

describe('normalizeCHIDsRequired', () => {
  it('lowercases, strips braces, dedupes', () => {
    expect(normalizeCHIDsRequired([`{${G.toUpperCase()}}`, G])).toEqual([G])
  })
  it('rejects non-guid', () => {
    expect(() => normalizeCHIDsRequired(['not-a-guid'])).toThrow(APIError)
  })
  it('rejects empty', () => {
    expect(() => normalizeCHIDsRequired(['', '  '])).toThrow(APIError)
  })
})
