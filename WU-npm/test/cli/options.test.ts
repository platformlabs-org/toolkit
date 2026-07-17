import { describe, it, expect } from 'vitest'
import { assembleOptions } from '../../src/cli/options.js'
import { DEFAULT_CONFIG } from '../../src/config/store.js'
import { APIError } from '../../src/support/errors.js'

describe('assembleOptions', () => {
  it('uses config defaults when no CLI', () => {
    const o = assembleOptions(DEFAULT_CONFIG, [])
    expect(o.msContact).toBe(DEFAULT_CONFIG.msContact)
    expect(o.destination).toBe('windowsUpdate')
    expect(o.goLiveImmediate).toBe(true)
    expect(o.offerFilter).toBe(true)
    expect(o.outPath).toBe('shippinglabel.request.json')
  })
  it('CLI overrides config', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--ms-contact', 'a@b.com', '--product-id', 'P'])
    expect(o.msContact).toBe('a@b.com')
    expect(o.productId).toBe('P')
  })
  it('schedule-go-live disables immediate', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--schedule-go-live']).goLiveImmediate).toBe(false)
  })
  it('go-live-date sets date and disables immediate', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--go-live-date', '2026-01-01'])
    expect(o.goLiveImmediate).toBe(false)
    expect(o.goLiveDate).toBe('2026-01-01')
  })
  it('no-auto-install flips config default', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--no-auto-install-os-upgrade'])
    expect(o.autoInstallDuringOSUpgrade).toBe(false)
  })
  it('visible-to-accounts parses ints', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--visible-to-accounts', '1', '2']).visibleToAccounts).toEqual([1, 2])
  })
  it('visible-to-accounts rejects non-int', () => {
    expect(() => assembleOptions(DEFAULT_CONFIG, ['--visible-to-accounts', 'x'])).toThrow(APIError)
  })
  it('chids multi', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--chids', 'a', 'b']).chids).toEqual(['a', 'b'])
  })
})
