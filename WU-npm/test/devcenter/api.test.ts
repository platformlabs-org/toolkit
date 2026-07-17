import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSubmission } from '../../src/devcenter/submission.js'
import { createShippingLabel } from '../../src/devcenter/shippingLabel.js'
import { APIError } from '../../src/support/errors.js'

afterEach(() => vi.restoreAllMocks())

describe('devcenter api', () => {
  it('getSubmission returns object on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })))
    await expect(getSubmission('tok', 'P', 'S')).resolves.toEqual({ id: 1 })
  })
  it('getSubmission throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })))
    await expect(getSubmission('tok', 'P', 'S')).rejects.toThrow(APIError)
  })
  it('createShippingLabel returns {} on 2xx non-json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 201 })))
    await expect(createShippingLabel('tok', 'P', 'S', {})).resolves.toEqual({})
  })
})
