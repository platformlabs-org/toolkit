export function isBlank(s?: string | null): boolean {
  return s == null || s.trim() === ''
}

export function firstNonEmpty(...vals: (string | undefined | null)[]): string {
  for (const v of vals) if (!isBlank(v)) return v as string
  return ''
}

export function or(v: string | undefined, def: string): string {
  return isBlank(v) ? def : (v as string)
}

export function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

export function fit(s: string, width: number): string {
  const r = [...s]
  if (r.length === width) return s
  if (r.length < width) return s + ' '.repeat(width - r.length)
  if (width <= 1) return r.slice(0, width).join('')
  return r.slice(0, width - 1).join('') + '…'
}

export function toLower(s: string): string {
  return s.toLowerCase()
}

export function containsLower(hay: string, needleLower: string): boolean {
  return hay.toLowerCase().includes(needleLower)
}
