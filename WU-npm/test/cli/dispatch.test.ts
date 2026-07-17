import { describe, it, expect } from 'vitest'
import { resolveInvocation } from '../../src/cli/dispatch.js'

const names = ['submit']

describe('resolveInvocation', () => {
  it('no args → menu', () => {
    expect(resolveInvocation([], names)).toEqual({ kind: 'menu' })
  })
  it('--version / -v → version', () => {
    expect(resolveInvocation(['--version'], names)).toEqual({ kind: 'version' })
    expect(resolveInvocation(['-v'], names)).toEqual({ kind: 'version' })
  })
  it('--help / -h → help', () => {
    expect(resolveInvocation(['--help'], names)).toEqual({ kind: 'help' })
    expect(resolveInvocation(['-h'], names)).toEqual({ kind: 'help' })
  })
  it('known command → run with remaining args', () => {
    expect(resolveInvocation(['submit'], names)).toEqual({ kind: 'run', name: 'submit', rest: [] })
    expect(resolveInvocation(['submit', '--dry-run', '--chids', 'x'], names)).toEqual({
      kind: 'run',
      name: 'submit',
      rest: ['--dry-run', '--chids', 'x'],
    })
  })
  it('command with --help / -h → commandHelp', () => {
    expect(resolveInvocation(['submit', '--help'], names)).toEqual({ kind: 'commandHelp', name: 'submit' })
    expect(resolveInvocation(['submit', '-h'], names)).toEqual({ kind: 'commandHelp', name: 'submit' })
  })
  it('flags but no command → menu', () => {
    expect(resolveInvocation(['--dry-run'], names)).toEqual({ kind: 'menu' })
  })
  it('unknown command → unknown', () => {
    expect(resolveInvocation(['foobar'], names)).toEqual({ kind: 'unknown', name: 'foobar' })
  })
  it('flags before the command are preserved in rest', () => {
    expect(resolveInvocation(['--dry-run', 'submit', '--no-ui'], names)).toEqual({
      kind: 'run',
      name: 'submit',
      rest: ['--dry-run', '--no-ui'],
    })
  })
})
