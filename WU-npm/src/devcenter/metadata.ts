import { APIError } from '../support/errors.js'
import { fetchText, type CallOpts } from './client.js'

export async function downloadDriverMetadata(
  token: string,
  url: string,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (url.toLowerCase().includes('manage.devcenter.microsoft.com')) {
    headers.Authorization = `Bearer ${token}`
  }
  const body = await fetchText(url, { method: 'GET', headers, signal: opts.signal }, 'GET driverMetadata')
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new APIError('driverMetadata 不是合法 JSON:\n' + (e as Error).message)
  }
}
