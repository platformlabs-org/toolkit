import { isBlank } from './strings.js'

export function tryParseSubmissionShortcut(
  input: string,
): { productId: string; submissionId: string } | null {
  const s = input.trim()
  if (s === '') return null

  const tokens = s.split('_').map((t) => t.trim()).filter((t) => t !== '')
  if (tokens.length >= 3) {
    const p = tokens[1]
    const sub = tokens[2]
    if (!isBlank(p) && !isBlank(sub)) return { productId: p, submissionId: sub }
  }

  const digits = s.replace(/\D+/g, '')
  if (digits.length < 19) return null
  const submissionId = digits.slice(digits.length - 19)
  const remain = digits.slice(0, digits.length - 19)
  if (remain.length >= 17) {
    const productId = remain.slice(remain.length - 17)
    return { productId, submissionId }
  }
  return null
}
