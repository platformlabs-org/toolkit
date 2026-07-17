import { describe, it, expect } from 'vitest'
import { isBlank, firstNonEmpty, or, padRight, fit, containsLower } from '../../src/support/strings.js'

describe('strings', () => {
  it('isBlank', () => {
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank('x')).toBe(false)
  })
  it('firstNonEmpty', () => {
    expect(firstNonEmpty('', '  ', 'a', 'b')).toBe('a')
    expect(firstNonEmpty('', undefined)).toBe('')
  })
  it('or', () => {
    expect(or('', 'def')).toBe('def')
    expect(or('x', 'def')).toBe('x')
  })
  it('padRight', () => {
    expect(padRight('ab', 4)).toBe('ab  ')
    expect(padRight('abcd', 2)).toBe('abcd')
  })
  it('fit truncates with ellipsis', () => {
    expect(fit('abcdef', 4)).toBe('abc…')
    expect(fit('ab', 4)).toBe('ab  ')
  })
  it('containsLower', () => {
    expect(containsLower('HelloWorld', 'world')).toBe(true)
    expect(containsLower('Hello', 'xyz')).toBe(false)
  })
})
