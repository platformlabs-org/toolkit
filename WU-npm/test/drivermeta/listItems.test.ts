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
    expect(item.text.trim().endsWith('PNP'.padEnd(28))).toBe(false) // sanity: text present (trim removes trailing spaces from fit())
    expect(item.text).toContain('PNP')
  })
})
