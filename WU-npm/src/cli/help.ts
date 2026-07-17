import type { Command } from '../commands/types.js'

export function renderGlobalHelp(commands: Command[], version: string): string {
  return [
    `wu ${version} — Microsoft Hardware Dev Center CLI`,
    '',
    'Usage:',
    '  wu <command> [options]',
    '  wu                      (no command → interactive menu)',
    '',
    'Commands:',
    ...commands.map((c) => `  ${c.name.padEnd(10)} ${c.summary}`),
    '',
    'Options:',
    '  -h, --help              Show this help',
    '  -v, --version           Show version',
    '',
    "Run 'wu <command> --help' for command-specific options.",
  ].join('\n')
}

export function renderCommandHelp(cmd: Command): string {
  return `wu ${cmd.name} — ${cmd.summary}\n\n${cmd.usage}`
}
