import { describe, it, expect, vi, afterEach } from 'vitest'
import { acquireToken } from '../../src/auth/token.js'
import { APIError } from '../../src/support/errors.js'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
}

describe('acquireToken', () => {
  it('returns access_token on 200', async () => {
    mockFetch(200, JSON.stringify({ access_token: 'TOK' }))
    await expect(acquireToken('t', 'c', 's')).resolves.toBe('TOK')
  })
  it('throws APIError on non-2xx', async () => {
    mockFetch(400, 'bad')
    await expect(acquireToken('t', 'c', 's')).rejects.toThrow(APIError)
  })
  it('throws when access_token missing', async () => {
    mockFetch(200, JSON.stringify({ foo: 'bar' }))
    await expect(acquireToken('t', 'c', 's')).rejects.toThrow(APIError)
  })
})
