import { writeFileSync } from 'node:fs'
import { loadConfig } from '../config/store.js'
import { loadCredential, saveCredential } from '../config/credentials.js'
import { assembleOptions, type CLIOptions } from '../cli/options.js'
import { firstNonEmpty, isBlank, containsLower } from '../support/strings.js'
import { isCanceled, CanceledError } from '../support/errors.js'
import { tryParseSubmissionShortcut } from '../support/submissionShortcut.js'
import { acquireToken } from '../auth/token.js'
import { getSubmission, findDriverMetadataURL, printWorkflowStatus } from '../devcenter/submission.js'
import { downloadDriverMetadata } from '../devcenter/metadata.js'
import { createShippingLabel } from '../devcenter/shippingLabel.js'
import { parse } from '../drivermeta/parse.js'
import type { HardwareTarget, ParseResult } from '../drivermeta/types.js'
import { buildListItems } from '../drivermeta/listItems.js'
import { normalizeCHIDsRequired } from '../validate/chid.js'
import { buildPayload } from '../shippinglabel/payload.js'
import { termSize } from '../support/terminal.js'
import { runMultiSelectLegend, type Legend } from '../ui/multiselect.js'
import { promptIndexSelection } from '../ui/fallbackSelect.js'
import * as ui from '../ui/index.js'
import { VERSION } from '../version.js'

const PARTNER =
  'https://partner.microsoft.com/en-us/dashboard/hardware/driver/%p/submission/%s/ShippingLabel/%d'

export async function run(argv: string[]): Promise<number> {
  const config = loadConfig()
  const opt = assembleOptions(config, argv)

  ui.banner('WU', VERSION)
  ui.endLine('Start')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  timeout.unref?.()   // MUST unref so a completed run doesn't keep the event loop alive (index.ts uses process.exitCode, not process.exit)

  try {
    // Step 1: Auth
    ui.section('Initialize', 1, 4)
    ui.item('Loading credentials', 'credential.enc')
    const cred = loadCredential()
    // Stored credential wins over CLI flags for tenant/client/secret (matches Go FirstNonEmpty(cred, opt) order).
    opt.tenantId = firstNonEmpty(cred.tenantId, opt.tenantId)
    opt.clientId = firstNonEmpty(cred.clientId, opt.clientId)
    opt.clientSecret = firstNonEmpty(cred.clientSecret, opt.clientSecret)

    // msContact is stored with the credential (not hardcoded). CLI --ms-contact overrides the
    // stored value; if neither is set, prompt for it on first run alongside the credential.
    opt.msContact = firstNonEmpty(opt.msContact, cred.msContact)

    if (isBlank(opt.tenantId)) opt.tenantId = await ui.prompt('tenant_id', '')
    if (isBlank(opt.clientId)) opt.clientId = await ui.prompt('client_id', '')
    if (isBlank(opt.clientSecret)) opt.clientSecret = await ui.promptSecret('client_secret')
    if (isBlank(opt.msContact)) opt.msContact = await ui.prompt('ms_contact (Microsoft approval contact)', '')

    saveCredential({
      tenantId: opt.tenantId,
      clientId: opt.clientId,
      clientSecret: opt.clientSecret,
      msContact: opt.msContact,
    })

    const token = await ui.spin('Acquiring token...', () =>
      acquireToken(opt.tenantId, opt.clientId, opt.clientSecret, { signal: controller.signal }),
    )
    ui.ok('Token acquired')

    // Step 2: Submission
    ui.section('Submission Selection', 2, 4)
    if (isBlank(opt.productId)) {
      const raw = await ui.prompt('productId (or submission shortcut)', '')
      const shortcut = tryParseSubmissionShortcut(raw)
      if (shortcut) {
        opt.productId = shortcut.productId
        if (isBlank(opt.submissionId)) opt.submissionId = shortcut.submissionId
      } else {
        opt.productId = raw
      }
    }
    if (isBlank(opt.submissionId)) opt.submissionId = await ui.prompt('submissionId', '')

    if (
      isBlank(opt.tenantId) ||
      isBlank(opt.clientId) ||
      isBlank(opt.clientSecret) ||
      isBlank(opt.productId) ||
      isBlank(opt.submissionId)
    ) {
      ui.fail('tenant_id / client_id / client_secret / product_id / submission_id cannot be empty')
      return 2
    }

    const submission = await ui.spin('Fetching submission...', () =>
      getSubmission(token, opt.productId, opt.submissionId, { signal: controller.signal }),
    )
    ui.ok('Submission fetched')
    printWorkflowStatus(submission)

    // Step 3: Metadata
    ui.section('Metadata Analysis', 3, 4)
    const url = await ui.spin('Resolving metadata URL...', async () => findDriverMetadataURL(submission))
    const metaRoot = await ui.spin('Downloading driverMetadata...', () =>
      downloadDriverMetadata(token, url, { signal: controller.signal }),
    )
    const parsed = await ui.spin('Parsing candidates...', async () => parse(metaRoot))
    ui.ok(`Metadata OK: candidates=${parsed.targets.length}`)
    if (parsed.targets.length === 0) {
      ui.fail('No candidates found in metadata')
      return 1
    }

    ui.section('Selection', 3, 4)
    const selected = await selectTargets(parsed, opt)
    if (selected.length === 0) {
      ui.fail('No hardwareIds selected')
      return 1
    }
    if (!opt.selectAll) ui.ok(`Selected ${selected.length} hardwareIds`)
    ui.endLine('Selected')

    // Step 4: Create
    ui.section('Create Shipping Label', 4, 4)
    let name = opt.name
    if (isBlank(name)) name = await ui.prompt('Shipping label name', '{OEM Name}: {Project Name}')

    let chids: string[]
    if (opt.chids.length > 0) {
      chids = normalizeCHIDsRequired(opt.chids)
    } else {
      chids = await promptChidsLoop()
    }

    const bodyObj = buildPayload(opt, name, selected, chids)
    const outPath = firstNonEmpty(opt.outPath, 'shippinglabel.request.json')
    writeFileSync(outPath, JSON.stringify(bodyObj, null, 2))
    ui.ok('Request saved: ' + outPath)

    if (opt.dryRun) {
      ui.endLine('--dry-run (no POST)')
      return 0
    }

    const resp = await ui.spin('Creating shipping label...', () =>
      createShippingLabel(token, opt.productId, opt.submissionId, bodyObj, { signal: controller.signal }),
    )
    if (typeof resp.id === 'number' || typeof resp.id === 'string') {
      const shippingURL = PARTNER.replace('%p', opt.productId)
        .replace('%s', opt.submissionId)
        .replace('%d', String(resp.id))
      ui.ok('Created: ' + shippingURL)
    } else {
      ui.ok('Created (id not found in response)')
    }

    ui.endLine('Complete')
    await ui.prompt('Press Enter to exit', '')
    return 0
  } catch (e) {
    if (isCanceled(e) || (e as { name?: string })?.name === 'AbortError') {
      ui.fail('User canceled or timeout.')
      return 130
    }
    process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n')
    return 1
  } finally {
    clearTimeout(timeout)
  }
}

async function selectTargets(parsed: ParseResult, opt: CLIOptions): Promise<HardwareTarget[]> {
  if (opt.selectAll) {
    ui.ok(`--select-all: selected ${parsed.targets.length} hardwareIds`)
    return [...parsed.targets]
  }

  let working = parsed.targets
  if (working.length > 300 && opt.offerFilter) {
    if (await ui.promptYesNo(`Too many candidates (${working.length}). Filter by keyword?`, true)) {
      const kw = await ui.prompt('Filter keyword (INF/OS/PNP...)', '')
      if (!isBlank(kw)) {
        const low = kw.toLowerCase()
        working = working.filter(
          (t) =>
            containsLower(t.infId, low) ||
            containsLower(t.osCode, low) ||
            containsLower(t.pnpId, low) ||
            containsLower(t.manufacturer, low) ||
            containsLower(t.deviceDescription, low),
        )
      }
    }
  }
  if (working.length === 0) throw new CanceledError('No candidates after filter.')

  const { width } = termSize()
  const items = buildListItems(working, parsed.ui, width)

  let idxs: number[]
  if (opt.noUi) {
    idxs = await promptIndexSelection('Select targets', items.map((i) => i.text), false, true)
  } else {
    const legends: Legend[] = parsed.ui.legends.map((l) => ({
      tag: l.tag,
      color: l.color,
      itemCount: l.itemCount,
      sampleInfs: l.sampleInfs,
    }))
    idxs = await runMultiSelectLegend(
      'Select targets (Space to toggle, Enter to confirm)',
      legends,
      items,
    )
  }
  return idxs.map((i) => working[i])
}

async function promptChidsLoop(): Promise<string[]> {
  for (;;) {
    const raw = await ui.prompt('CHIDs (Required, comma separated)', '')
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '')
    try {
      return normalizeCHIDsRequired(parts)
    } catch (e) {
      ui.errorInside(e instanceof Error ? e.message : String(e))
    }
  }
}
