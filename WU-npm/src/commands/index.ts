import type { Command } from './types.js'
import { submitCommand } from './submit.js'

// The command registry. Add new subcommands here.
export const COMMANDS: Command[] = [submitCommand]

export type { Command }
