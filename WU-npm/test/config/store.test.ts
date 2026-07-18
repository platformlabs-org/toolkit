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
  it('has the expected built-in defaults and no msContact', () => {
    expect(DEFAULT_CONFIG.affectedOems).toEqual(['N/A'])
    expect(DEFAULT_CONFIG.destination).toBe('windowsUpdate')
    // msContact is deliberately NOT a config default — it lives with the credential.
    expect('msContact' in DEFAULT_CONFIG).toBe(false)
  })
  it('missing fields fall back to defaults', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ destination: 'custom' }))
    const cfg = loadConfig(p)
    expect(cfg.destination).toBe('custom')
    expect(cfg.businessJustification).toBe(DEFAULT_CONFIG.businessJustification)
  })
  it('round-trips via save/load', () => {
    const p = tmpFile()
    const cfg = { ...DEFAULT_CONFIG, destination: 'x-dest' }
    saveConfig(cfg, p)
    expect(loadConfig(p).destination).toBe('x-dest')
  })
  it('missing file is created on disk after loadConfig', () => {
    const p = tmpFile()
    loadConfig(p)
    expect(existsSync(p)).toBe(true)
  })
})
