import { describe, it, expect } from 'vitest'
import { buildListItems } from '../../src/drivermeta/listItems.js'
import type { HardwareTarget, BundleUIMapping } from '../../src/drivermeta/types.js'

const ui: BundleUIMapping = {
  bundleColorById: { b: 2 },
  bundleTagById: { b: 'B1' },
  legends: [],
}
const t: HardwareTarget = {
  bundleId: 'b', bundleTag: 'B1', infId: 'inf.inf', osCode: 'OS', pnpId: 'PNP',
  manufacturer: 'Maker', deviceDescription: 'Device',
}

describe('buildListItems', () => {
  it('includes tag, fields and extra info joined by |', () => {
    const [item] = buildListItems([t], ui, 200)
    expect(item.color).toBe(2)
    expect(item.text).toContain('B1')
    expect(item.text).toContain('inf.inf')
    expect(item.text).toContain('Maker | Device')
  })
  it('omits extra when manufacturer and description blank', () => {
    const [item] = buildListItems([{ ...t, manufacturer: '', deviceDescription: '' }], ui, 200)
    expect(item.text).not.toContain('|  |')
    expect(item.text).toContain('PNP')
    // no extra segment: exactly 3 pipe-delimited columns (tag+inf | os | pnp), no 4th
    const parts = item.text.split(' | ')
    expect(parts).toHaveLength(3)
  })

  it('shrinks columns when width is small', () => {
    const long: HardwareTarget = {
      bundleId: 'b', bundleTag: 'B1',
      infId: 'i'.repeat(40), osCode: 'o'.repeat(40), pnpId: 'p'.repeat(40),
      manufacturer: '', deviceDescription: '',
    }
    const [item] = buildListItems([long], ui, 55)
    const cols = item.text.split(' | ')
    // cols[0] = 'B1  ' + fitted inf (infW=27), cols[1] = fitted os (18), cols[2] = fitted pnp (18)
    expect(cols[1].length).toBe(18)
    expect(cols[2].length).toBe(18)
  })
})
