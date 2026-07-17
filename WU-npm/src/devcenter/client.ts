import { APIError } from '../support/errors.js'

export const BASE_API = 'https://manage.devcenter.microsoft.com/v2.0/my/hardware'

export interface CallOpts {
  signal?: AbortSignal
}

export async function fetchText(
  url: string,
  init: RequestInit,
  errPrefix: string,
): Promise<string> {
  const resp = await fetch(url, init)
  const body = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`${errPrefix} 失败: ${resp.status}\n${body}`)
  }
  return body
}
