import { describe, it, expect } from 'vitest'
import { renderGlobalHelp, renderCommandHelp } from '../../src/cli/help.js'
import type { Command } from '../../src/commands/types.js'

const cmd: Command = {
  name: 'submit',
  summary: 'Create a shipping label',
  usage: 'Usage: wu submit [options]\n  --dry-run   Do not POST',
  run: async () => 0,
}

describe('help', () => {
  it('global help lists commands, version and the options', () => {
    const out = renderGlobalHelp([cmd], '2.3.4')
    expect(out).toContain('2.3.4')
    expect(out).toContain('submit')
    expect(out).toContain('Create a shipping label')
    expect(out).toContain('--help')
    expect(out).toContain('--version')
  })
  it('command help shows the command usage', () => {
    const out = renderCommandHelp(cmd)
    expect(out).toContain('wu submit')
    expect(out).toContain('--dry-run')
  })
})
