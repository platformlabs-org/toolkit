const FLAGS = new Set([
  '--select-all', '--dry-run', '--schedule-go-live',
  '--auto-install-os-upgrade', '--no-auto-install-os-upgrade',
  '--auto-install-applicable', '--no-auto-install-applicable',
  '--is-disclosure-restricted', '--publish-to-windows10s',
  '--is-reboot-required', '--is-co-engineered',
  '--is-for-unreleased-hardware', '--has-ui-software',
  '--no-ui', '--no-filter',
])

const MULTI = new Set(['--visible-to-accounts', '--affected-oems', '--chids'])

export interface ArgSet {
  hasFlag(k: string): boolean
  getSingle(k: string): string
  getMany(k: string): string[]
}

export function parseArgs(argv: string[]): ArgSet {
  const values = new Map<string, string[]>()
  const flags = new Set<string>()
  const add = (k: string, v: string) => {
    const arr = values.get(k) ?? []
    arr.push(v)
    values.set(k, arr)
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    if (FLAGS.has(a)) {
      flags.add(a)
      continue
    }
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      add(a, '')
      continue
    }
    if (MULTI.has(a)) {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        i++
        add(a, argv[i])
      }
    } else {
      i++
      add(a, argv[i])
    }
  }

  return {
    hasFlag: (k) => flags.has(k),
    getSingle: (k) => values.get(k)?.[0] ?? '',
    getMany: (k) => values.get(k) ?? [],
  }
}
