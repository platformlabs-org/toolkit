import { describe, it, expect } from 'vitest'
import { findDriverMetadataURL } from '../../src/devcenter/submission.js'
import { APIError } from '../../src/support/errors.js'

describe('findDriverMetadataURL', () => {
  it('finds from downloads.items', () => {
    const sub = { downloads: { items: [{ type: 'driverMetadata', url: 'http://x/meta' }] } }
    expect(findDriverMetadataURL(sub)).toBe('http://x/meta')
  })
  it('finds from links rel', () => {
    const sub = { links: [{ rel: 'driverMetadata', href: 'http://x/href' }] }
    expect(findDriverMetadataURL(sub)).toBe('http://x/href')
  })
  it('throws when absent', () => {
    expect(() => findDriverMetadataURL({})).toThrow(APIError)
  })
})
