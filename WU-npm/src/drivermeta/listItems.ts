import { fit, padRight, or, isBlank } from '../support/strings.js'
import type { HardwareTarget, BundleUIMapping, Color } from './types.js'

export interface ListItem {
  text: string
  color: Color
}

export function buildListItems(items: HardwareTarget[], ui: BundleUIMapping, width: number): ListItem[] {
  let infW = 28
  let osW = 28
  let pnpW = 28
  const minInf = 16
  const minOs = 18
  const minPnp = 18

  const contentBudget = width - 20
  const need = 3 + 1 + infW + 3 + osW + 3 + pnpW + 3 + 10
  if (contentBudget < need) {
    let reduce = need - contentBudget
    while (reduce > 0 && (infW > minInf || osW > minOs || pnpW > minPnp)) {
      if (pnpW > minPnp) { pnpW--; reduce--; if (reduce === 0) break }
      if (osW > minOs) { osW--; reduce--; if (reduce === 0) break }
      if (infW > minInf) { infW--; reduce--; if (reduce === 0) break }
    }
  }

  return items.map((c) => {
    const b = padRight(or(c.bundleTag, ''), 3)
    const inf = fit(c.infId, infW)
    const os = fit(c.osCode, osW)
    const pnp = fit(c.pnpId, pnpW)

    const extraParts: string[] = []
    if (!isBlank(c.manufacturer)) extraParts.push(c.manufacturer.trim())
    if (!isBlank(c.deviceDescription)) extraParts.push(c.deviceDescription.trim())
    const extra = extraParts.join(' | ')

    const text = isBlank(extra)
      ? `${b} ${inf} | ${os} | ${pnp}`
      : `${b} ${inf} | ${os} | ${pnp} | ${extra}`

    return { text, color: ui.bundleColorById[c.bundleId] }
  })
}
