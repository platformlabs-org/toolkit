import { COMMANDS } from '../commands/index.js'
import { renderGlobalHelp, renderCommandHelp } from './help.js'
import { runMenu } from './menu.js'
import { VERSION } from '../version.js'
import { isCanceled } from '../support/errors.js'
import * as ui from '../ui/index.js'

export type Invocation =
  | { kind: 'version' }
  | { kind: 'help' }
  | { kind: 'menu' }
  | { kind: 'commandHelp'; name: string }
  | { kind: 'run'; name: string; rest: string[] }
  | { kind: 'unknown'; name: string }

// Pure: decide what an argv means. Global --help/--version only when they are the first token.
// The first non-flag token is the command name; its token is removed and the remaining args
// (flags before/after) are passed through. A --help/-h among those requests command help.
export function resolveInvocation(argv: string[], names: string[]): Invocation {
  const first = argv[0]
  if (first === '--version' || first === '-v') return { kind: 'version' }
  if (first === '--help' || first === '-h') return { kind: 'help' }

  const idx = argv.findIndex((a) => !a.startsWith('-'))
  if (idx === -1) return { kind: 'menu' } // empty, or only flags

  const name = argv[idx]
  if (!names.includes(name)) return { kind: 'unknown', name }

  const rest = [...argv.slice(0, idx), ...argv.slice(idx + 1)]
  if (rest.includes('--help') || rest.includes('-h')) return { kind: 'commandHelp', name }
  return { kind: 'run', name, rest }
}

async function runMenuAndRun(): Promise<number> {
  // The menu needs an interactive terminal. In a pipe/CI, guide the user instead of
  // letting clack fail with a cryptic uv_tty_init error.
  if (!process.stdin.isTTY) {
    process.stderr.write('No command specified and no interactive terminal is available.\n\n')
    process.stderr.write(renderGlobalHelp(COMMANDS, VERSION) + '\n')
    return 2
  }

  let name: string
  try {
    name = await runMenu(COMMANDS)
  } catch (e) {
    if (isCanceled(e)) return 130
    throw e
  }
  const cmd = COMMANDS.find((c) => c.name === name)!
  return cmd.run([])
}

export async function dispatch(argv: string[]): Promise<number> {
  const inv = resolveInvocation(argv, COMMANDS.map((c) => c.name))

  switch (inv.kind) {
    case 'version':
      process.stdout.write(VERSION + '\n')
      return 0
    case 'help':
      process.stdout.write(renderGlobalHelp(COMMANDS, VERSION) + '\n')
      return 0
    case 'commandHelp':
      process.stdout.write(renderCommandHelp(COMMANDS.find((c) => c.name === inv.name)!) + '\n')
      return 0
    case 'run':
      return COMMANDS.find((c) => c.name === inv.name)!.run(inv.rest)
    case 'unknown':
      ui.fail(`unknown command: ${inv.name}`)
      return runMenuAndRun()
    case 'menu':
      return runMenuAndRun()
  }
}
