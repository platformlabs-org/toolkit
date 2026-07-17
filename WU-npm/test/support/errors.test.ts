import { describe, it, expect } from 'vitest'
import { APIError, CanceledError, isAPIError, isCanceled } from '../../src/support/errors.js'

describe('errors', () => {
  it('APIError', () => {
    const e = new APIError('boom')
    expect(isAPIError(e)).toBe(true)
    expect(e.message).toBe('boom')
  })
  it('CanceledError', () => {
    expect(isCanceled(new CanceledError())).toBe(true)
    expect(isCanceled(new APIError('x'))).toBe(false)
  })
})
