import { describe, it, expect } from 'vitest'
import { tryParseSubmissionShortcut } from '../../src/support/submissionShortcut.js'

describe('tryParseSubmissionShortcut', () => {
  it('underscore tokens', () => {
    expect(tryParseSubmissionShortcut('x_prod123_sub456')).toEqual({ productId: 'prod123', submissionId: 'sub456' })
  })
  it('digits heuristic', () => {
    // 17位product + 19位submission
    const product = '1'.repeat(17)
    const submission = '2'.repeat(19)
    const raw = `${product}${submission}`
    expect(tryParseSubmissionShortcut(raw)).toEqual({ productId: product, submissionId: submission })
  })
  it('too short returns null', () => {
    expect(tryParseSubmissionShortcut('123')).toBeNull()
    expect(tryParseSubmissionShortcut('')).toBeNull()
  })
})
