import { APIError } from '../support/errors.js'
import { isBlank } from '../support/strings.js'
import { BASE_API, fetchText, type CallOpts } from './client.js'

export async function getSubmission(
  token: string,
  productId: string,
  submissionId: string,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const url = `${BASE_API}/products/${productId}/submissions/${submissionId}`
  const body = await fetchText(
    url,
    { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: opts.signal },
    'GET submission',
  )
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new APIError('submission 响应不是 JSON object: ' + (e as Error).message)
  }
}

export function printWorkflowStatus(submission: Record<string, any>): void {
  const wf = submission?.['workflowStatus']
  if (!wf || typeof wf !== 'object') return
  const step = typeof wf.currentStep === 'string' ? wf.currentStep : ''
  const state = typeof wf.state === 'string' ? wf.state : ''
  if (!isBlank(step) || !isBlank(state)) {
    console.log(`  workflow: step=${step} state=${state}`)
  }
}

export function findDriverMetadataURL(submission: Record<string, any>): string {
  const items = submission?.downloads?.items
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === 'object' && String(it.type).toLowerCase() === 'drivermetadata') {
        if (!isBlank(it.url)) return it.url
      }
    }
  }
  const links = submission?.links
  if (Array.isArray(links)) {
    for (const lk of links) {
      if (lk && typeof lk === 'object' && String(lk.rel).toLowerCase() === 'drivermetadata') {
        if (!isBlank(lk.href)) return lk.href
      }
    }
  }
  throw new APIError('submission 中未找到 driverMetadata URL（downloads.items 或 links 均没有）')
}
