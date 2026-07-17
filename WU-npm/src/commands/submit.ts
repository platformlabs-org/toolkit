import type { Command } from './types.js'
import { run } from '../app/run.js'

const usage = `Usage: wu submit [options]

Runs the interactive workflow (auth → submission → metadata → select → create).
Any value not supplied via flags is prompted for. Precedence: CLI flags > ~/.wu/config.json.

Identity:
  --tenant-id <id>              Azure AD tenant id
  --client-id <id>             Azure AD application (client) id
  --client-secret <secret>      Azure AD client secret

Target:
  --product-id <id>             Hardware Dev Center product id
  --submission-id <id>          Submission id
  --chids <guid...>             One or more CHIDs (GUID 8-4-4-4-12)
  --name <text>                 Shipping label name

Selection:
  --select-all                  Select every candidate hardware id
  --no-ui                       Use numeric index selection instead of the TUI
  --no-filter                   Do not offer the keyword filter for large lists

Publishing:
  --dry-run                     Write the request JSON but do not POST
  --publish-to-windows10s       Publish to Windows 10 S
  --schedule-go-live            Do not go live immediately
  --go-live-date <date>         Schedule go-live for a date (implies --schedule-go-live)
  --destination <dest>          Publish destination (default: windowsUpdate)
  --out <path>                  Request JSON output path (default: shippinglabel.request.json)

Auto-install:
  --auto-install-os-upgrade / --no-auto-install-os-upgrade
  --auto-install-applicable   / --no-auto-install-applicable

MS approval info:
  --ms-contact <email>          Microsoft contact
  --validations-performed <text>
  --business-justification <text>
  --affected-oems <name...>     One or more affected OEMs
  --is-reboot-required
  --is-co-engineered
  --is-for-unreleased-hardware
  --has-ui-software

Other:
  --visible-to-accounts <id...> One or more account ids (integers)
  --is-disclosure-restricted`

export const submitCommand: Command = {
  name: 'submit',
  summary: 'Create a Windows Update shipping label for a driver submission',
  usage,
  run: (argv) => run(argv),
}
