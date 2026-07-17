import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, saveConfig } from '../../src/config/store.js'

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'wu-')), 'config.json')
}

describe('config store', () => {
  it('missing file returns defaults and creates it', () => {
    const p = tmpFile()
    const cfg = loadConfig(p)
    expect(cfg).toEqual(DEFAULT_CONFIG)
  })
  it('default msContact matches Go value', () => {
    expect(DEFAULT_CONFIG.msContact).toBe('feizh@microsoft.com')
    expect(DEFAULT_CONFIG.affectedOems).toEqual(['N/A'])
    expect(DEFAULT_CONFIG.destination).toBe('windowsUpdate')
  })
  it('missing fields fall back to defaults', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ msContact: 'a@b.com' }))
    const cfg = loadConfig(p)
    expect(cfg.msContact).toBe('a@b.com')
    expect(cfg.businessJustification).toBe(DEFAULT_CONFIG.businessJustification)
  })
  it('round-trips via save/load', () => {
    const p = tmpFile()
    const cfg = { ...DEFAULT_CONFIG, msContact: 'x@y.com' }
    saveConfig(cfg, p)
    expect(loadConfig(p).msContact).toBe('x@y.com')
  })
  it('missing file is created on disk after loadConfig', () => {
    const p = tmpFile()
    loadConfig(p)
    expect(existsSync(p)).toBe(true)
  })
})
