import { describe, it, expect } from 'vitest'
import { buildPayload } from '../../src/shippinglabel/payload.js'
import { assembleOptions } from '../../src/cli/options.js'
import { DEFAULT_CONFIG } from '../../src/config/store.js'
import { APIError } from '../../src/support/errors.js'
import type { HardwareTarget } from '../../src/drivermeta/types.js'

const target: HardwareTarget = {
  bundleId: 'b', bundleTag: 'B1', infId: 'inf', osCode: 'OS', pnpId: 'PNP',
  manufacturer: '', deviceDescription: '',
}

describe('buildPayload', () => {
  it('throws when chids empty', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, [])
    expect(() => buildPayload(opt, 'n', [target], [])).toThrow(APIError)
  })
  it('builds structure with defaults (auto-install true → approval block)', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, ['--ms-contact', 'contact@corp.com'])
    const p = buildPayload(opt, 'MyLabel', [target], ['chid-1'])
    expect(p.name).toBe('MyLabel')
    expect(p.destination).toBe('windowsUpdate')
    expect(p.publishingSpecifications.goLiveDate).toBe('')
    expect(p.publishingSpecifications.manualAcquisition).toBe(false)
    expect(p.publishingSpecifications.additionalInfoForMsApproval.microsoftContact).toBe('contact@corp.com')
    expect(p.targeting.hardwareIds).toEqual([
      { bundleId: 'b', infId: 'inf', operatingSystemCode: 'OS', pnpString: 'PNP' },
    ])
    expect(p.targeting.chids).toEqual([{ chid: 'chid-1', distributionState: 'pendingAdd' }])
  })
  it('omits approval block and sets manualAcquisition when both auto-install false', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, ['--no-auto-install-os-upgrade', '--no-auto-install-applicable'])
    const p = buildPayload(opt, 'n', [target], ['chid-1'])
    expect(p.publishingSpecifications.manualAcquisition).toBe(true)
    expect(p.publishingSpecifications.additionalInfoForMsApproval).toBeUndefined()
  })
})
