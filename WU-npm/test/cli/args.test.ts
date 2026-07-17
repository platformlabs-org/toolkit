import { describe, it, expect } from 'vitest'
import { parseArgs } from '../../src/cli/args.js'

describe('parseArgs', () => {
  it('single value', () => {
    const m = parseArgs(['--product-id', 'P1'])
    expect(m.getSingle('--product-id')).toBe('P1')
  })
  it('flags', () => {
    const m = parseArgs(['--dry-run', '--select-all'])
    expect(m.hasFlag('--dry-run')).toBe(true)
    expect(m.hasFlag('--select-all')).toBe(true)
    expect(m.hasFlag('--no-ui')).toBe(false)
  })
  it('multi value collects until next --', () => {
    const m = parseArgs(['--chids', 'a', 'b', 'c', '--dry-run'])
    expect(m.getMany('--chids')).toEqual(['a', 'b', 'c'])
    expect(m.hasFlag('--dry-run')).toBe(true)
  })
  it('value flag followed by another flag yields empty value', () => {
    const m = parseArgs(['--name', '--dry-run'])
    expect(m.getSingle('--name')).toBe('')
    expect(m.hasFlag('--dry-run')).toBe(true)
  })
})
