import { APIError } from '../support/errors.js'
import { BASE_API, type CallOpts } from './client.js'

export async function createShippingLabel(
  token: string,
  productId: string,
  submissionId: string,
  body: Record<string, any>,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const url = `${BASE_API}/products/${productId}/submissions/${submissionId}/shippingLabels`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  const text = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`POST /shippingLabels 失败: ${resp.status}\n${text}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
