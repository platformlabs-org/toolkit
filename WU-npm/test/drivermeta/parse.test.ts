import { describe, it, expect } from 'vitest'
import { parse } from '../../src/drivermeta/parse.js'
import { APIError } from '../../src/support/errors.js'

const meta = {
  BundleInfoMap: {
    bundleB: {
      InfInfoMap: {
        'inf2.inf': {
          OSPnPInfoMap: {
            WINDOWS_v100_X64_RS5: {
              'PCI\\X': { Manufacturer: 'M', DeviceDescription: 'D' },
            },
          },
        },
      },
    },
    bundleA: {
      InfInfoMap: {
        'inf1.inf': {
          OSPnPInfoMap: {
            WINDOWS_v100_X64_RS5: {
              'PCI\\Y': {},
            },
          },
        },
      },
    },
  },
}

describe('parse', () => {
  it('throws when BundleInfoMap missing', () => {
    expect(() => parse({})).toThrow(APIError)
  })
  it('assigns tags by sorted bundle id', () => {
    const r = parse(meta)
    // bundleA sorts before bundleB -> B1, B2
    expect(r.ui.bundleTagById['bundleA']).toBe('B1')
    expect(r.ui.bundleTagById['bundleB']).toBe('B2')
  })
  it('produces sorted targets with fields', () => {
    const r = parse(meta)
    expect(r.targets.length).toBe(2)
    // sorted by bundleTag: B1 (bundleA) first
    expect(r.targets[0].bundleTag).toBe('B1')
    expect(r.targets[0].infId).toBe('inf1.inf')
    expect(r.targets[0].pnpId).toBe('PCI\\Y')
    const withMeta = r.targets.find((t) => t.pnpId === 'PCI\\X')!
    expect(withMeta.manufacturer).toBe('M')
    expect(withMeta.deviceDescription).toBe('D')
  })
  it('builds legends with counts', () => {
    const r = parse(meta)
    const legA = r.ui.legends.find((l) => l.bundleId === 'bundleA')!
    expect(legA.tag).toBe('B1')
    expect(legA.itemCount).toBe(1)
    expect(legA.sampleInfs).toEqual(['inf1.inf'])
  })
})
