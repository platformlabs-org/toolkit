import { APIError } from '../support/errors.js'
import { COLORS, type BundleUIMapping, type HardwareTarget, type ParseResult } from './types.js'

const lc = (s: string) => s.toLowerCase()

export function parse(metaRoot: Record<string, any>): ParseResult {
  const bundleInfoMap = metaRoot?.['BundleInfoMap']
  if (!bundleInfoMap || typeof bundleInfoMap !== 'object') {
    throw new APIError('driverMetadata 缺少 BundleInfoMap（结构不符合示例）')
  }

  const bundleIds = Object.keys(bundleInfoMap).sort((a, b) => (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0))

  const ui: BundleUIMapping = { bundleColorById: {}, bundleTagById: {}, legends: [] }
  bundleIds.forEach((id, i) => {
    ui.bundleTagById[id] = 'B' + (i + 1)
    ui.bundleColorById[id] = COLORS[i % COLORS.length]
  })

  const all: HardwareTarget[] = []
  const seen = new Set<string>()
  const infSetByBundle: Record<string, Set<string>> = {}
  const countByBundle: Record<string, number> = {}

  for (const bundleId of Object.keys(bundleInfoMap)) {
    const bundleTag = ui.bundleTagById[bundleId]
    const bundleObj = bundleInfoMap[bundleId]
    if (!bundleObj || typeof bundleObj !== 'object') continue
    const infInfoMap = bundleObj['InfInfoMap']
    if (!infInfoMap || typeof infInfoMap !== 'object') continue

    infSetByBundle[bundleId] ??= new Set()

    for (const infId of Object.keys(infInfoMap)) {
      infSetByBundle[bundleId].add(infId)
      const infObj = infInfoMap[infId]
      if (!infObj || typeof infObj !== 'object') continue
      const osPnpInfoMap = infObj['OSPnPInfoMap']
      if (!osPnpInfoMap || typeof osPnpInfoMap !== 'object') continue

      for (const osCode of Object.keys(osPnpInfoMap)) {
        const pnpDict = osPnpInfoMap[osCode]
        if (!pnpDict || typeof pnpDict !== 'object') continue

        for (const pnpId of Object.keys(pnpDict)) {
          const detail = pnpDict[pnpId]
          let manufacturer = ''
          let deviceDescription = ''
          if (detail && typeof detail === 'object') {
            manufacturer = typeof detail['Manufacturer'] === 'string' ? detail['Manufacturer'] : ''
            deviceDescription = typeof detail['DeviceDescription'] === 'string' ? detail['DeviceDescription'] : ''
          }

          const key = `${bundleId}|${infId}|${osCode}|${pnpId}`
          if (seen.has(key)) continue
          seen.add(key)

          all.push({ bundleId, bundleTag, infId, osCode, pnpId, manufacturer, deviceDescription })
          countByBundle[bundleId] = (countByBundle[bundleId] ?? 0) + 1
        }
      }
    }
  }

  for (const bundleId of bundleIds) {
    const set = infSetByBundle[bundleId]
    let sample: string[] = []
    if (set) {
      sample = [...set].sort((a, b) => (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0)).slice(0, 3)
    }
    ui.legends.push({
      bundleId,
      tag: ui.bundleTagById[bundleId],
      color: ui.bundleColorById[bundleId],
      itemCount: countByBundle[bundleId] ?? 0,
      sampleInfs: sample,
    })
  }

  all.sort((a, b) => {
    const cmp = (x: string, y: string) => (lc(x) < lc(y) ? -1 : lc(x) > lc(y) ? 1 : 0)
    return cmp(a.bundleTag, b.bundleTag) || cmp(a.infId, b.infId) || cmp(a.osCode, b.osCode) || cmp(a.pnpId, b.pnpId)
  })

  return { targets: all, ui }
}
