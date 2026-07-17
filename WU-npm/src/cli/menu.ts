import * as p from '@clack/prompts'
import { CanceledError } from '../support/errors.js'
import type { Command } from '../commands/types.js'

// Interactive single-select of a subcommand (↑↓ + Enter). Throws CanceledError on Esc/Ctrl-C.
export async function runMenu(commands: Command[]): Promise<string> {
  const choice = await p.select({
    message: 'Select a command',
    options: commands.map((c) => ({ value: c.name, label: c.name, hint: c.summary })),
  })
  if (p.isCancel(choice)) throw new CanceledError()
  return choice as string
}
