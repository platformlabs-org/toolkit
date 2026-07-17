import { APIError } from '../support/errors.js'
import { isBlank } from '../support/strings.js'

export async function acquireToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/token`
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    resource: 'https://manage.devcenter.microsoft.com',
  })

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: opts.signal,
  })

  const body = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`获取 token 失败: ${resp.status}\n${body}`)
  }

  let obj: any
  try {
    obj = JSON.parse(body)
  } catch (e) {
    throw new APIError('token 响应不是合法 JSON: ' + (e as Error).message)
  }

  const token = typeof obj.access_token === 'string' ? obj.access_token : ''
  if (isBlank(token)) throw new APIError('响应缺少 access_token: ' + body)
  return token
}
