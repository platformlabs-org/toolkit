// A top-level wu subcommand. New features are added by writing one of these and
// registering it in commands/index.ts — the dispatcher, menu, and help pick it up automatically.
export interface Command {
  name: string
  summary: string // one line — shown in the interactive menu and global help
  usage: string // multi-line flag reference — shown by `wu <name> --help`
  run(argv: string[]): Promise<number> // returns the process exit code
}
