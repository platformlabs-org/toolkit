import { describe, it, expect } from 'vitest'
import { parseIndexExpr } from '../../src/ui/fallbackSelect.js'

describe('parseIndexExpr', () => {
  it('all keywords', () => {
    expect(parseIndexExpr('a', 3)).toEqual([0, 1, 2])
    expect(parseIndexExpr('*', 2)).toEqual([0, 1])
  })
  it('comma list (0-based, deduped, sorted)', () => {
    expect(parseIndexExpr('1,3,3', 5)).toEqual([0, 2])
  })
  it('range', () => {
    expect(parseIndexExpr('2-4', 10)).toEqual([1, 2, 3])
  })
  it('reversed range', () => {
    expect(parseIndexExpr('4-2', 10)).toEqual([1, 2, 3])
  })
  it('throws on garbage', () => {
    expect(() => parseIndexExpr('x', 3)).toThrow()
  })
})
