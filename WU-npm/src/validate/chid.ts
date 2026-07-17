import { APIError } from '../support/errors.js'

const GUID = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/

export function normalizeCHIDsRequired(input: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of input) {
    const s = raw.trim()
    if (s === '') continue
    if (!GUID.test(s)) {
      throw new APIError('CHID 不是合法 GUID（需 8-4-4-4-12 且带连字符）: ' + s)
    }
    let core = s
    if (core.startsWith('{') && core.endsWith('}') && core.length > 2) {
      core = core.slice(1, -1)
    }
    const norm = core.toLowerCase()
    if (!seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }

  if (out.length === 0) throw new APIError('至少需要 1 个 CHID。')
  return out
}
