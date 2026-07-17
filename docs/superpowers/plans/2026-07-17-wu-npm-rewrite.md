# WU-npm (wu-cli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `WU-Go` 用 TypeScript 完全重写为 CLI npm 包 `wu-cli`（bin `wu`），功能与 Go 版 1:1 对齐，业务默认值移入 `~/.wu/config.json`，凭据加密存 `~/.wu/credential.enc`。

**Architecture:** ESM TypeScript 包，镜像 Go 的分层（cli/config/auth/devcenter/drivermeta/shippinglabel/validate/ui/support/app）。纯逻辑函数全部 TDD 单测；网络层用原生 `fetch` + mock 测试；交互层用 `@clack/prompts`，自定义多选基于 `@clack/core` 并把选择/分页状态抽成纯 reducer 单测。

**Tech Stack:** TypeScript · ESM · Node ≥18 · `@clack/prompts` · `@clack/core` · `picocolors` · 构建 `tsup` · 测试 `vitest` · 原生 `fetch`/`node:crypto`。

## Global Constraints

- 目录：全部代码在 `WU-npm/`；`WU-Go/` 不改动。
- 包名 `wu-cli`，bin 命令 `wu`，入口 `dist/index.js`。
- 模块：ESM（`package.json` `"type":"module"`）；TS `module`/`moduleResolution` = `NodeNext`；`target` ES2022；`strict:true`。
- Node ≥18；只用原生 `fetch`；零原生依赖（加密用 `node:crypto`）。
- 配置目录 `~/.wu/`（`os.homedir()`）；config 明文 JSON，凭据 AES-256-GCM 加密。
- 取值优先级：**CLI 参数 > 配置文件**；不支持 `HW_*` 环境变量。
- API 常量（逐字沿用 Go 版）：
  - baseAPI `https://manage.devcenter.microsoft.com/v2.0/my/hardware`
  - token endpoint `https://login.microsoftonline.com/{tenant}/oauth2/token`，`resource=https://manage.devcenter.microsoft.com`
  - partner URL `https://partner.microsoft.com/en-us/dashboard/hardware/driver/{product}/submission/{submission}/ShippingLabel/{id}`
  - 请求超时 180s；driverMetadata 下载仅当 URL 含 `manage.devcenter.microsoft.com` 时附 Bearer。
- 退出码：成功 0；参数缺失 2；取消/超时 130；其它错误 1。
- 提交信息结尾附：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
WU-npm/
  package.json  tsconfig.json  tsup.config.ts  vitest.config.ts  .gitignore  README.md
  src/
    index.ts                       # bin 入口
    support/strings.ts             # isBlank/firstNonEmpty/or/padRight/fit/containsLower/toLower
    support/errors.ts              # APIError/CanceledError + 判定
    support/submissionShortcut.ts  # tryParseSubmissionShortcut
    support/terminal.ts            # termSize best-effort
    validate/chid.ts               # normalizeCHIDsRequired
    cli/args.ts                    # parseArgs -> ArgSet
    cli/options.ts                 # CLIOptions + assembleOptions(config, argv)
    config/paths.ts                # wuDir/configPath/credentialPath
    config/store.ts                # DEFAULT_CONFIG/loadConfig/saveConfig
    config/crypto.ts               # encrypt/decrypt (AES-256-GCM machine-bound)
    config/credentials.ts          # loadCredential/saveCredential
    auth/token.ts                  # acquireToken
    devcenter/client.ts            # createClient + fetchJson
    devcenter/submission.ts        # getSubmission/findDriverMetadataURL/printWorkflowStatus
    devcenter/metadata.ts          # downloadDriverMetadata
    devcenter/shippingLabel.ts     # createShippingLabel
    drivermeta/types.ts            # HardwareTarget/BundleLegend/BundleUIMapping/COLORS
    drivermeta/parse.ts            # parse(metaRoot)
    drivermeta/listItems.ts        # buildListItems(targets, ui, width)
    shippinglabel/payload.ts       # buildPayload
    ui/index.ts                    # banner/section/item/prompt/secret/confirm/spinner/ok/fail/...
    ui/multiselect.ts              # 自定义多选 (render + reducer)
    ui/selectState.ts              # 纯 reducer：光标/分页/选择状态
    ui/fallbackSelect.ts           # parseIndexExpr + promptIndexSelection
    app/run.ts                     # 4 步编排
  test/                            # 与 src 镜像的单测
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `WU-npm/package.json`, `WU-npm/tsconfig.json`, `WU-npm/tsup.config.ts`, `WU-npm/vitest.config.ts`, `WU-npm/.gitignore`, `WU-npm/src/index.ts`, `WU-npm/test/smoke.test.ts`

**Interfaces:**
- Produces: 可运行的 `npm run build` / `npm test`；`src/index.ts` 暂时是占位入口。

- [ ] **Step 1: 写脚手架文件**

`WU-npm/package.json`:
```json
{
  "name": "wu-cli",
  "version": "1.0.0",
  "description": "CLI to create Windows Update Shipping Labels via Microsoft Hardware Dev Center API",
  "type": "module",
  "bin": { "wu": "dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@clack/core": "^0.3.4",
    "@clack/prompts": "^0.7.0",
    "picocolors": "^1.0.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.1.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`WU-npm/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src"]
}
```

`WU-npm/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
```

`WU-npm/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
})
```

`WU-npm/.gitignore`:
```
node_modules/
dist/
```

`WU-npm/src/index.ts`:
```ts
export {}
```

`WU-npm/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 2: 安装依赖并跑测试**

Run: `cd WU-npm && npm install && npm test`
Expected: smoke 测试 PASS。

- [ ] **Step 3: 验证构建**

Run: `cd WU-npm && npm run build`
Expected: 生成 `dist/index.js`，首行为 `#!/usr/bin/env node`。

- [ ] **Step 4: Commit**

```bash
git add WU-npm/package.json WU-npm/tsconfig.json WU-npm/tsup.config.ts WU-npm/vitest.config.ts WU-npm/.gitignore WU-npm/src/index.ts WU-npm/test/smoke.test.ts
git commit -m "chore(wu-npm): scaffold TypeScript CLI package"
```

---

## Task 2: support/strings + support/errors

**Files:**
- Create: `WU-npm/src/support/strings.ts`, `WU-npm/src/support/errors.ts`, `WU-npm/test/support/strings.test.ts`, `WU-npm/test/support/errors.test.ts`

**Interfaces:**
- Produces:
  - `isBlank(s?: string): boolean` — undefined/null/纯空白为 true
  - `firstNonEmpty(...vals: (string|undefined)[]): string` — 首个非空白，否则 `""`
  - `or(v: string|undefined, def: string): string`
  - `padRight(s: string, n: number): string`
  - `fit(s: string, width: number): string` — 超长截断加 `…`，不足补空格到 width
  - `toLower(s: string): string` / `containsLower(hay: string, needleLower: string): boolean`
  - `class APIError extends Error`；`class CanceledError extends Error`
  - `isAPIError(e): boolean` / `isCanceled(e): boolean`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/support/strings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isBlank, firstNonEmpty, or, padRight, fit, containsLower } from '../../src/support/strings.js'

describe('strings', () => {
  it('isBlank', () => {
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank('   ')).toBe(true)
    expect(isBlank('x')).toBe(false)
  })
  it('firstNonEmpty', () => {
    expect(firstNonEmpty('', '  ', 'a', 'b')).toBe('a')
    expect(firstNonEmpty('', undefined)).toBe('')
  })
  it('or', () => {
    expect(or('', 'def')).toBe('def')
    expect(or('x', 'def')).toBe('x')
  })
  it('padRight', () => {
    expect(padRight('ab', 4)).toBe('ab  ')
    expect(padRight('abcd', 2)).toBe('abcd')
  })
  it('fit truncates with ellipsis', () => {
    expect(fit('abcdef', 4)).toBe('abc…')
    expect(fit('ab', 4)).toBe('ab  ')
  })
  it('containsLower', () => {
    expect(containsLower('HelloWorld', 'world')).toBe(true)
    expect(containsLower('Hello', 'xyz')).toBe(false)
  })
})
```

`WU-npm/test/support/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { APIError, CanceledError, isAPIError, isCanceled } from '../../src/support/errors.js'

describe('errors', () => {
  it('APIError', () => {
    const e = new APIError('boom')
    expect(isAPIError(e)).toBe(true)
    expect(e.message).toBe('boom')
  })
  it('CanceledError', () => {
    expect(isCanceled(new CanceledError())).toBe(true)
    expect(isCanceled(new APIError('x'))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/support`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`WU-npm/src/support/errors.ts`:
```ts
export class APIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export class CanceledError extends Error {
  constructor(message = 'canceled') {
    super(message)
    this.name = 'CanceledError'
  }
}

export function isAPIError(e: unknown): boolean {
  return e instanceof APIError
}

export function isCanceled(e: unknown): boolean {
  return e instanceof CanceledError
}
```

`WU-npm/src/support/strings.ts`:
```ts
export function isBlank(s?: string | null): boolean {
  return s == null || s.trim() === ''
}

export function firstNonEmpty(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (!isBlank(v ?? undefined)) return (v as string).trim() === '' ? (v as string) : (v as string)
  }
  return ''
}

export function or(v: string | undefined, def: string): string {
  return isBlank(v) ? def : (v as string)
}

export function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

export function fit(s: string, width: number): string {
  const r = [...s]
  if (r.length === width) return s
  if (r.length < width) return s + ' '.repeat(width - r.length)
  if (width <= 1) return r.slice(0, width).join('')
  return r.slice(0, width - 1).join('') + '…'
}

export function toLower(s: string): string {
  return s.toLowerCase()
}

export function containsLower(hay: string, needleLower: string): boolean {
  return hay.toLowerCase().includes(needleLower)
}
```

> 注：`firstNonEmpty` 返回值应为原始（未 trim）字符串以对齐 Go 的 `FirstNonEmpty`。测试里的输入无前后空白，直接返回即可。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/support`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/support WU-npm/test/support
git commit -m "feat(wu-npm): add string/error support helpers"
```

---

## Task 3: support/submissionShortcut

**Files:**
- Create: `WU-npm/src/support/submissionShortcut.ts`, `WU-npm/test/support/submissionShortcut.test.ts`

**Interfaces:**
- Consumes: `isBlank` from `support/strings`
- Produces: `tryParseSubmissionShortcut(input: string): { productId: string; submissionId: string } | null`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/support/submissionShortcut.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { tryParseSubmissionShortcut } from '../../src/support/submissionShortcut.js'

describe('tryParseSubmissionShortcut', () => {
  it('underscore tokens', () => {
    expect(tryParseSubmissionShortcut('x_prod123_sub456')).toEqual({ productId: 'prod123', submissionId: 'sub456' })
  })
  it('digits heuristic', () => {
    // 17位product + 19位submission
    const product = '1'.repeat(17)
    const submission = '2'.repeat(19)
    const raw = `${product}${submission}`
    expect(tryParseSubmissionShortcut(raw)).toEqual({ productId: product, submissionId: submission })
  })
  it('too short returns null', () => {
    expect(tryParseSubmissionShortcut('123')).toBeNull()
    expect(tryParseSubmissionShortcut('')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/support/submissionShortcut.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/support/submissionShortcut.ts`:
```ts
import { isBlank } from './strings.js'

export function tryParseSubmissionShortcut(
  input: string,
): { productId: string; submissionId: string } | null {
  const s = input.trim()
  if (s === '') return null

  const tokens = s.split('_').map((t) => t.trim()).filter((t) => t !== '')
  if (tokens.length >= 3) {
    const p = tokens[1]
    const sub = tokens[2]
    if (!isBlank(p) && !isBlank(sub)) return { productId: p, submissionId: sub }
  }

  const digits = s.replace(/\D+/g, '')
  if (digits.length < 19) return null
  const submissionId = digits.slice(digits.length - 19)
  const remain = digits.slice(0, digits.length - 19)
  if (remain.length >= 17) {
    const productId = remain.slice(remain.length - 17)
    return { productId, submissionId }
  }
  return null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/support/submissionShortcut.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/support/submissionShortcut.ts WU-npm/test/support/submissionShortcut.test.ts
git commit -m "feat(wu-npm): add submission shortcut parser"
```

---

## Task 4: validate/chid

**Files:**
- Create: `WU-npm/src/validate/chid.ts`, `WU-npm/test/validate/chid.test.ts`

**Interfaces:**
- Consumes: `APIError` from `support/errors`
- Produces: `normalizeCHIDsRequired(input: string[]): string[]`（非法/空抛 `APIError`）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/validate/chid.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeCHIDsRequired } from '../../src/validate/chid.js'
import { APIError } from '../../src/support/errors.js'

const G = '12345678-1234-1234-1234-123456789abc'

describe('normalizeCHIDsRequired', () => {
  it('lowercases, strips braces, dedupes', () => {
    expect(normalizeCHIDsRequired([`{${G.toUpperCase()}}`, G])).toEqual([G])
  })
  it('rejects non-guid', () => {
    expect(() => normalizeCHIDsRequired(['not-a-guid'])).toThrow(APIError)
  })
  it('rejects empty', () => {
    expect(() => normalizeCHIDsRequired(['', '  '])).toThrow(APIError)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/validate/chid.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/validate/chid.ts`:
```ts
import { APIError } from '../support/errors.js'

const GUID = /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/

export function normalizeCHIDsRequired(input: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of input) {
    const s = raw.trim()
    if (s === '') continue
    if (!GUID.test(s)) {
      throw new APIError('CHID 不是合法 GUID（需 8-4-4-4-12 且带连字符）: ' + s)
    }
    let core = s
    if (core.startsWith('{') && core.endsWith('}') && core.length > 2) {
      core = core.slice(1, -1)
    }
    const norm = core.toLowerCase()
    if (!seen.has(norm)) {
      seen.add(norm)
      out.push(norm)
    }
  }

  if (out.length === 0) throw new APIError('至少需要 1 个 CHID。')
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/validate/chid.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/validate WU-npm/test/validate
git commit -m "feat(wu-npm): add CHID GUID normalization"
```

---

## Task 5: cli/args

**Files:**
- Create: `WU-npm/src/cli/args.ts`, `WU-npm/test/cli/args.test.ts`

**Interfaces:**
- Produces:
  - `parseArgs(argv: string[]): ArgSet`
  - `interface ArgSet { hasFlag(k): boolean; getSingle(k): string; getMany(k): string[] }`
  - 多值 key：`--visible-to-accounts` / `--affected-oems` / `--chids`
  - flag 白名单：`--select-all --dry-run --schedule-go-live --auto-install-os-upgrade --no-auto-install-os-upgrade --auto-install-applicable --no-auto-install-applicable --is-disclosure-restricted --publish-to-windows10s --is-reboot-required --is-co-engineered --is-for-unreleased-hardware --has-ui-software --no-ui --no-filter`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/cli/args.test.ts`:
```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/cli/args.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/cli/args.ts`:
```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/cli/args.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/cli/args.ts WU-npm/test/cli/args.test.ts
git commit -m "feat(wu-npm): add CLI argument parser"
```

---

## Task 6: config/paths + config/store

**Files:**
- Create: `WU-npm/src/config/paths.ts`, `WU-npm/src/config/store.ts`, `WU-npm/test/config/store.test.ts`

**Interfaces:**
- Produces:
  - `wuDir(): string` = `~/.wu`；`configPath(): string`；`credentialPath(): string`
  - `interface WuConfig { msContact:string; validationsPerformed:string; affectedOems:string[]; businessJustification:string; destination:string; goLiveImmediate:boolean; autoInstallDuringOSUpgrade:boolean; autoInstallOnApplicableSystems:boolean; isDisclosureRestricted:boolean; publishToWindows10s:boolean; isRebootRequired:boolean; isCoEngineered:boolean; isForUnreleasedHardware:boolean; hasUiSoftware:boolean; visibleToAccounts:number[] }`
  - `DEFAULT_CONFIG: WuConfig`（值见 §4.2）
  - `loadConfig(path?: string): WuConfig`（不存在/损坏 → 生成/返回默认；缺字段回落默认）
  - `saveConfig(cfg: WuConfig, path?: string): void`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/config/store.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/config/store.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/config/paths.ts`:
```ts
import { homedir } from 'node:os'
import { join } from 'node:path'

export function wuDir(): string {
  return join(homedir(), '.wu')
}
export function configPath(): string {
  return join(wuDir(), 'config.json')
}
export function credentialPath(): string {
  return join(wuDir(), 'credential.enc')
}
```

`WU-npm/src/config/store.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { configPath } from './paths.js'

export interface WuConfig {
  msContact: string
  validationsPerformed: string
  affectedOems: string[]
  businessJustification: string
  destination: string
  goLiveImmediate: boolean
  autoInstallDuringOSUpgrade: boolean
  autoInstallOnApplicableSystems: boolean
  isDisclosureRestricted: boolean
  publishToWindows10s: boolean
  isRebootRequired: boolean
  isCoEngineered: boolean
  isForUnreleasedHardware: boolean
  hasUiSoftware: boolean
  visibleToAccounts: number[]
}

export const DEFAULT_CONFIG: WuConfig = {
  msContact: 'feizh@microsoft.com',
  validationsPerformed: 'Product assurance team full range tested',
  affectedOems: ['N/A'],
  businessJustification: 'to meet MDA requirements',
  destination: 'windowsUpdate',
  goLiveImmediate: true,
  autoInstallDuringOSUpgrade: true,
  autoInstallOnApplicableSystems: true,
  isDisclosureRestricted: false,
  publishToWindows10s: false,
  isRebootRequired: false,
  isCoEngineered: false,
  isForUnreleasedHardware: false,
  hasUiSoftware: false,
  visibleToAccounts: [],
}

export function loadConfig(path: string = configPath()): WuConfig {
  if (!existsSync(path)) {
    saveConfig(DEFAULT_CONFIG, path)
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<WuConfig>
    return { ...DEFAULT_CONFIG, ...raw }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: WuConfig, path: string = configPath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/config/store.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/config/paths.ts WU-npm/src/config/store.ts WU-npm/test/config/store.test.ts
git commit -m "feat(wu-npm): add config paths and store with built-in defaults"
```

---

## Task 7: config/crypto

**Files:**
- Create: `WU-npm/src/config/crypto.ts`, `WU-npm/test/config/crypto.test.ts`

**Interfaces:**
- Produces:
  - `interface EncBlob { v: number; salt: string; iv: string; tag: string; data: string }`
  - `encrypt(plain: string, material?: string): EncBlob`
  - `decrypt(blob: EncBlob, material?: string): string`（认证失败/换 material 抛异常）
  - `machineMaterial(): string`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/config/crypto.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../src/config/crypto.js'

describe('crypto', () => {
  it('round-trips with same material', () => {
    const blob = encrypt('secret-value', 'material-A')
    expect(decrypt(blob, 'material-A')).toBe('secret-value')
  })
  it('fails with different material', () => {
    const blob = encrypt('secret-value', 'material-A')
    expect(() => decrypt(blob, 'material-B')).toThrow()
  })
  it('produces base64 fields and version', () => {
    const blob = encrypt('x', 'm')
    expect(blob.v).toBe(1)
    expect(typeof blob.salt).toBe('string')
    expect(typeof blob.data).toBe('string')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/config/crypto.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/config/crypto.ts`:
```ts
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { hostname, userInfo, platform } from 'node:os'

export interface EncBlob {
  v: number
  salt: string
  iv: string
  tag: string
  data: string
}

export function machineMaterial(): string {
  return `${hostname()}\0${userInfo().username}\0${platform()}`
}

export function encrypt(plain: string, material: string = machineMaterial()): EncBlob {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = scryptSync(material, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: data.toString('base64'),
  }
}

export function decrypt(blob: EncBlob, material: string = machineMaterial()): string {
  const key = scryptSync(material, Buffer.from(blob.salt, 'base64'), 32)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'))
  const out = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()])
  return out.toString('utf8')
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/config/crypto.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/config/crypto.ts WU-npm/test/config/crypto.test.ts
git commit -m "feat(wu-npm): add machine-bound AES-256-GCM crypto"
```

---

## Task 8: config/credentials

**Files:**
- Create: `WU-npm/src/config/credentials.ts`, `WU-npm/test/config/credentials.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt`/`EncBlob` from `config/crypto`；`credentialPath` from `config/paths`
- Produces:
  - `interface Credential { tenantId: string; clientId: string; clientSecret: string }`
  - `loadCredential(path?: string, material?: string): Credential`（缺失/解密失败 → 空凭据）
  - `saveCredential(cred: Credential, path?: string, material?: string): void`（加密写盘）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/config/credentials.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCredential, saveCredential } from '../../src/config/credentials.js'

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'wu-')), 'credential.enc')
}
const M = 'test-material'

describe('credentials', () => {
  it('missing file yields empty credential', () => {
    expect(loadCredential(tmpFile(), M)).toEqual({ tenantId: '', clientId: '', clientSecret: '' })
  })
  it('round-trips encrypted', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, p, M)
    expect(loadCredential(p, M)).toEqual({ tenantId: 't', clientId: 'c', clientSecret: 's' })
  })
  it('wrong material yields empty credential (no throw)', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 's' }, p, M)
    expect(loadCredential(p, 'other')).toEqual({ tenantId: '', clientId: '', clientSecret: '' })
  })
  it('stored file is not plaintext', () => {
    const p = tmpFile()
    saveCredential({ tenantId: 't', clientId: 'c', clientSecret: 'super-secret' }, p, M)
    // read raw and ensure secret not present
    const raw = require('node:fs').readFileSync(p, 'utf8')
    expect(raw).not.toContain('super-secret')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/config/credentials.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/config/credentials.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { credentialPath } from './paths.js'
import { encrypt, decrypt, machineMaterial, type EncBlob } from './crypto.js'

export interface Credential {
  tenantId: string
  clientId: string
  clientSecret: string
}

const EMPTY: Credential = { tenantId: '', clientId: '', clientSecret: '' }

export function loadCredential(
  path: string = credentialPath(),
  material: string = machineMaterial(),
): Credential {
  if (!existsSync(path)) return { ...EMPTY }
  try {
    const blob = JSON.parse(readFileSync(path, 'utf8')) as EncBlob
    const plain = decrypt(blob, material)
    const obj = JSON.parse(plain) as Partial<Credential>
    return {
      tenantId: obj.tenantId ?? '',
      clientId: obj.clientId ?? '',
      clientSecret: obj.clientSecret ?? '',
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveCredential(
  cred: Credential,
  path: string = credentialPath(),
  material: string = machineMaterial(),
): void {
  mkdirSync(dirname(path), { recursive: true })
  const blob = encrypt(JSON.stringify(cred), material)
  writeFileSync(path, JSON.stringify(blob, null, 2))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/config/credentials.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/config/credentials.ts WU-npm/test/config/credentials.test.ts
git commit -m "feat(wu-npm): add encrypted credential store"
```

---

## Task 9: drivermeta/types + parse

**Files:**
- Create: `WU-npm/src/drivermeta/types.ts`, `WU-npm/src/drivermeta/parse.ts`, `WU-npm/test/drivermeta/parse.test.ts`

**Interfaces:**
- Consumes: `APIError` from `support/errors`
- Produces:
  - `type Color = number`（0..9，索引进 COLORS 调色板）
  - `const COLORS: Color[]`（长度 10，顺序 Cyan..DarkMagenta）
  - `interface HardwareTarget { bundleId; bundleTag; infId; osCode; pnpId; manufacturer; deviceDescription }`（全 string）
  - `interface BundleLegend { bundleId; tag; color; itemCount; sampleInfs }`
  - `interface BundleUIMapping { bundleColorById: Record<string,Color>; bundleTagById: Record<string,string>; legends: BundleLegend[] }`
  - `interface ParseResult { targets: HardwareTarget[]; ui: BundleUIMapping }`
  - `parse(metaRoot: Record<string, any>): ParseResult`（缺 `BundleInfoMap` 抛 `APIError`）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/drivermeta/parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parse } from '../../src/drivermeta/parse.js'
import { APIError } from '../../src/support/errors.js'

const meta = {
  BundleInfoMap: {
    bundleB: {
      InfInfoMap: {
        'inf2.inf': {
          OSPnPInfoMap: {
            WINDOWS_v100_X64_RS5: {
              'PCI\\X': { Manufacturer: 'M', DeviceDescription: 'D' },
            },
          },
        },
      },
    },
    bundleA: {
      InfInfoMap: {
        'inf1.inf': {
          OSPnPInfoMap: {
            WINDOWS_v100_X64_RS5: {
              'PCI\\Y': {},
            },
          },
        },
      },
    },
  },
}

describe('parse', () => {
  it('throws when BundleInfoMap missing', () => {
    expect(() => parse({})).toThrow(APIError)
  })
  it('assigns tags by sorted bundle id', () => {
    const r = parse(meta)
    // bundleA sorts before bundleB -> B1, B2
    expect(r.ui.bundleTagById['bundleA']).toBe('B1')
    expect(r.ui.bundleTagById['bundleB']).toBe('B2')
  })
  it('produces sorted targets with fields', () => {
    const r = parse(meta)
    expect(r.targets.length).toBe(2)
    // sorted by bundleTag: B1 (bundleA) first
    expect(r.targets[0].bundleTag).toBe('B1')
    expect(r.targets[0].infId).toBe('inf1.inf')
    expect(r.targets[0].pnpId).toBe('PCI\\Y')
    const withMeta = r.targets.find((t) => t.pnpId === 'PCI\\X')!
    expect(withMeta.manufacturer).toBe('M')
    expect(withMeta.deviceDescription).toBe('D')
  })
  it('builds legends with counts', () => {
    const r = parse(meta)
    const legA = r.ui.legends.find((l) => l.bundleId === 'bundleA')!
    expect(legA.tag).toBe('B1')
    expect(legA.itemCount).toBe(1)
    expect(legA.sampleInfs).toEqual(['inf1.inf'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/drivermeta/parse.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/drivermeta/types.ts`:
```ts
export type Color = number // index into COLORS palette (0..9)

// 顺序沿用 Go：Cyan, Yellow, Green, Magenta, Blue, White, DarkCyan, DarkYellow, DarkGreen, DarkMagenta
export const COLORS: Color[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

export interface HardwareTarget {
  bundleId: string
  bundleTag: string
  infId: string
  osCode: string
  pnpId: string
  manufacturer: string
  deviceDescription: string
}

export interface BundleLegend {
  bundleId: string
  tag: string
  color: Color
  itemCount: number
  sampleInfs: string[]
}

export interface BundleUIMapping {
  bundleColorById: Record<string, Color>
  bundleTagById: Record<string, string>
  legends: BundleLegend[]
}

export interface ParseResult {
  targets: HardwareTarget[]
  ui: BundleUIMapping
}
```

`WU-npm/src/drivermeta/parse.ts`:
```ts
import { APIError } from '../support/errors.js'
import { COLORS, type BundleUIMapping, type HardwareTarget, type ParseResult } from './types.js'

const lc = (s: string) => s.toLowerCase()

export function parse(metaRoot: Record<string, any>): ParseResult {
  const bundleInfoMap = metaRoot?.['BundleInfoMap']
  if (!bundleInfoMap || typeof bundleInfoMap !== 'object') {
    throw new APIError('driverMetadata 缺少 BundleInfoMap（结构不符合示例）')
  }

  const bundleIds = Object.keys(bundleInfoMap).sort((a, b) => (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0))

  const ui: BundleUIMapping = { bundleColorById: {}, bundleTagById: {}, legends: [] }
  bundleIds.forEach((id, i) => {
    ui.bundleTagById[id] = 'B' + (i + 1)
    ui.bundleColorById[id] = COLORS[i % COLORS.length]
  })

  const all: HardwareTarget[] = []
  const seen = new Set<string>()
  const infSetByBundle: Record<string, Set<string>> = {}
  const countByBundle: Record<string, number> = {}

  for (const bundleId of Object.keys(bundleInfoMap)) {
    const bundleTag = ui.bundleTagById[bundleId]
    const bundleObj = bundleInfoMap[bundleId]
    if (!bundleObj || typeof bundleObj !== 'object') continue
    const infInfoMap = bundleObj['InfInfoMap']
    if (!infInfoMap || typeof infInfoMap !== 'object') continue

    infSetByBundle[bundleId] ??= new Set()

    for (const infId of Object.keys(infInfoMap)) {
      infSetByBundle[bundleId].add(infId)
      const infObj = infInfoMap[infId]
      if (!infObj || typeof infObj !== 'object') continue
      const osPnpInfoMap = infObj['OSPnPInfoMap']
      if (!osPnpInfoMap || typeof osPnpInfoMap !== 'object') continue

      for (const osCode of Object.keys(osPnpInfoMap)) {
        const pnpDict = osPnpInfoMap[osCode]
        if (!pnpDict || typeof pnpDict !== 'object') continue

        for (const pnpId of Object.keys(pnpDict)) {
          const detail = pnpDict[pnpId]
          let manufacturer = ''
          let deviceDescription = ''
          if (detail && typeof detail === 'object') {
            manufacturer = typeof detail['Manufacturer'] === 'string' ? detail['Manufacturer'] : ''
            deviceDescription = typeof detail['DeviceDescription'] === 'string' ? detail['DeviceDescription'] : ''
          }

          const key = `${bundleId}|${infId}|${osCode}|${pnpId}`
          if (seen.has(key)) continue
          seen.add(key)

          all.push({ bundleId, bundleTag, infId, osCode, pnpId, manufacturer, deviceDescription })
          countByBundle[bundleId] = (countByBundle[bundleId] ?? 0) + 1
        }
      }
    }
  }

  for (const bundleId of bundleIds) {
    const set = infSetByBundle[bundleId]
    let sample: string[] = []
    if (set) {
      sample = [...set].sort((a, b) => (lc(a) < lc(b) ? -1 : lc(a) > lc(b) ? 1 : 0)).slice(0, 3)
    }
    ui.legends.push({
      bundleId,
      tag: ui.bundleTagById[bundleId],
      color: ui.bundleColorById[bundleId],
      itemCount: countByBundle[bundleId] ?? 0,
      sampleInfs: sample,
    })
  }

  all.sort((a, b) => {
    const cmp = (x: string, y: string) => (lc(x) < lc(y) ? -1 : lc(x) > lc(y) ? 1 : 0)
    return cmp(a.bundleTag, b.bundleTag) || cmp(a.infId, b.infId) || cmp(a.osCode, b.osCode) || cmp(a.pnpId, b.pnpId)
  })

  return { targets: all, ui }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/drivermeta/parse.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/drivermeta/types.ts WU-npm/src/drivermeta/parse.ts WU-npm/test/drivermeta/parse.test.ts
git commit -m "feat(wu-npm): add driver metadata parser"
```

---

## Task 10: drivermeta/listItems

**Files:**
- Create: `WU-npm/src/drivermeta/listItems.ts`, `WU-npm/test/drivermeta/listItems.test.ts`

**Interfaces:**
- Consumes: `fit`/`padRight`/`or`/`isBlank` from `support/strings`；`HardwareTarget`/`BundleUIMapping`/`Color` from `drivermeta/types`
- Produces:
  - `interface ListItem { text: string; color: Color }`
  - `buildListItems(items: HardwareTarget[], ui: BundleUIMapping, width: number): ListItem[]`（width 显式传入，便于测试）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/drivermeta/listItems.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildListItems } from '../../src/drivermeta/listItems.js'
import type { HardwareTarget, BundleUIMapping } from '../../src/drivermeta/types.js'

const ui: BundleUIMapping = {
  bundleColorById: { b: 2 },
  bundleTagById: { b: 'B1' },
  legends: [],
}
const t: HardwareTarget = {
  bundleId: 'b', bundleTag: 'B1', infId: 'inf.inf', osCode: 'OS', pnpId: 'PNP',
  manufacturer: 'Maker', deviceDescription: 'Device',
}

describe('buildListItems', () => {
  it('includes tag, fields and extra info joined by |', () => {
    const [item] = buildListItems([t], ui, 200)
    expect(item.color).toBe(2)
    expect(item.text).toContain('B1')
    expect(item.text).toContain('inf.inf')
    expect(item.text).toContain('Maker | Device')
  })
  it('omits extra when manufacturer and description blank', () => {
    const [item] = buildListItems([{ ...t, manufacturer: '', deviceDescription: '' }], ui, 200)
    expect(item.text).not.toContain('|  |')
    expect(item.text.trim().endsWith('PNP'.padEnd(1))).toBe(false) // sanity: text present
    expect(item.text).toContain('PNP')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/drivermeta/listItems.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/drivermeta/listItems.ts`:
```ts
import { fit, padRight, or, isBlank } from '../support/strings.js'
import type { HardwareTarget, BundleUIMapping, Color } from './types.js'

export interface ListItem {
  text: string
  color: Color
}

export function buildListItems(items: HardwareTarget[], ui: BundleUIMapping, width: number): ListItem[] {
  let infW = 28
  let osW = 28
  let pnpW = 28
  const minInf = 16
  const minOs = 18
  const minPnp = 18

  const contentBudget = width - 20
  const need = 3 + 1 + infW + 3 + osW + 3 + pnpW + 3 + 10
  if (contentBudget < need) {
    let reduce = need - contentBudget
    while (reduce > 0 && (infW > minInf || osW > minOs || pnpW > minPnp)) {
      if (pnpW > minPnp) { pnpW--; reduce--; if (reduce === 0) break }
      if (osW > minOs) { osW--; reduce--; if (reduce === 0) break }
      if (infW > minInf) { infW--; reduce--; if (reduce === 0) break }
    }
  }

  return items.map((c) => {
    const b = padRight(or(c.bundleTag, ''), 3)
    const inf = fit(c.infId, infW)
    const os = fit(c.osCode, osW)
    const pnp = fit(c.pnpId, pnpW)

    const extraParts: string[] = []
    if (!isBlank(c.manufacturer)) extraParts.push(c.manufacturer.trim())
    if (!isBlank(c.deviceDescription)) extraParts.push(c.deviceDescription.trim())
    const extra = extraParts.join(' | ')

    const text = isBlank(extra)
      ? `${b} ${inf} | ${os} | ${pnp}`
      : `${b} ${inf} | ${os} | ${pnp} | ${extra}`

    return { text, color: ui.bundleColorById[c.bundleId] }
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/drivermeta/listItems.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/drivermeta/listItems.ts WU-npm/test/drivermeta/listItems.test.ts
git commit -m "feat(wu-npm): add list item builder with adaptive columns"
```

---

## Task 11: cli/options（CLIOptions + 装配）

**Files:**
- Create: `WU-npm/src/cli/options.ts`, `WU-npm/test/cli/options.test.ts`

**Interfaces:**
- Consumes: `parseArgs`/`ArgSet` from `cli/args`；`WuConfig`/`DEFAULT_CONFIG` from `config/store`
- Produces:
  - `interface CLIOptions { tenantId; clientId; clientSecret; productId; submissionId; selectAll; dryRun; outPath; destination; name; goLiveImmediate; goLiveDate; visibleToAccounts:number[]; autoInstallDuringOSUpgrade; autoInstallOnApplicableSystems; isDisclosureRestricted; publishToWindows10s; msContact; validationsPerformed; affectedOems:string[]; isRebootRequired; isCoEngineered; isForUnreleasedHardware; hasUiSoftware; businessJustification; chids:string[]; noUi; offerFilter }`
  - `assembleOptions(config: WuConfig, argv: string[]): CLIOptions`（config 作默认，CLI 覆盖；优先级 CLI > config）

**装配规则（对齐 Go `defaultCLIOptions` + `ParseCLIOptions`，但默认值来自 config）：**
- 字符串字段：CLI 非空则用 CLI，否则用 config/空。
- `selectAll/dryRun/...` 布尔 flag：出现即 true。
- `goLiveImmediate = config.goLiveImmediate && !hasFlag('--schedule-go-live')`；若给了 `--go-live-date` 则 `goLiveImmediate=false` 且记录日期。
- `autoInstall*`：默认取 config；`--auto-install-*` 置 true，`--no-auto-install-*` 置 false。
- `visibleToAccounts`：CLI 给了则解析为整数数组（非整数抛 `APIError`），否则用 config。
- `affectedOems`：CLI 给了则用 CLI，否则 config。
- `chids`：CLI 多值，否则空数组。
- `offerFilter = !hasFlag('--no-filter')`。
- `outPath = firstNonEmpty(getSingle('--out'), 'shippinglabel.request.json')`。

- [ ] **Step 1: 写失败测试**

`WU-npm/test/cli/options.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assembleOptions } from '../../src/cli/options.js'
import { DEFAULT_CONFIG } from '../../src/config/store.js'
import { APIError } from '../../src/support/errors.js'

describe('assembleOptions', () => {
  it('uses config defaults when no CLI', () => {
    const o = assembleOptions(DEFAULT_CONFIG, [])
    expect(o.msContact).toBe(DEFAULT_CONFIG.msContact)
    expect(o.destination).toBe('windowsUpdate')
    expect(o.goLiveImmediate).toBe(true)
    expect(o.offerFilter).toBe(true)
    expect(o.outPath).toBe('shippinglabel.request.json')
  })
  it('CLI overrides config', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--ms-contact', 'a@b.com', '--product-id', 'P'])
    expect(o.msContact).toBe('a@b.com')
    expect(o.productId).toBe('P')
  })
  it('schedule-go-live disables immediate', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--schedule-go-live']).goLiveImmediate).toBe(false)
  })
  it('go-live-date sets date and disables immediate', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--go-live-date', '2026-01-01'])
    expect(o.goLiveImmediate).toBe(false)
    expect(o.goLiveDate).toBe('2026-01-01')
  })
  it('no-auto-install flips config default', () => {
    const o = assembleOptions(DEFAULT_CONFIG, ['--no-auto-install-os-upgrade'])
    expect(o.autoInstallDuringOSUpgrade).toBe(false)
  })
  it('visible-to-accounts parses ints', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--visible-to-accounts', '1', '2']).visibleToAccounts).toEqual([1, 2])
  })
  it('visible-to-accounts rejects non-int', () => {
    expect(() => assembleOptions(DEFAULT_CONFIG, ['--visible-to-accounts', 'x'])).toThrow(APIError)
  })
  it('chids multi', () => {
    expect(assembleOptions(DEFAULT_CONFIG, ['--chids', 'a', 'b']).chids).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/cli/options.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/cli/options.ts`:
```ts
import { parseArgs, type ArgSet } from './args.js'
import type { WuConfig } from '../config/store.js'
import { firstNonEmpty, isBlank } from '../support/strings.js'
import { APIError } from '../support/errors.js'

export interface CLIOptions {
  tenantId: string
  clientId: string
  clientSecret: string
  productId: string
  submissionId: string
  selectAll: boolean
  dryRun: boolean
  outPath: string
  destination: string
  name: string
  goLiveImmediate: boolean
  goLiveDate: string
  visibleToAccounts: number[]
  autoInstallDuringOSUpgrade: boolean
  autoInstallOnApplicableSystems: boolean
  isDisclosureRestricted: boolean
  publishToWindows10s: boolean
  msContact: string
  validationsPerformed: string
  affectedOems: string[]
  isRebootRequired: boolean
  isCoEngineered: boolean
  isForUnreleasedHardware: boolean
  hasUiSoftware: boolean
  businessJustification: string
  chids: string[]
  noUi: boolean
  offerFilter: boolean
}

function parseIntStrict(s: string): number {
  if (!/^[+-]?\d+$/.test(s.trim())) throw new APIError('--visible-to-accounts 需要整数，但输入为: ' + s)
  return parseInt(s, 10)
}

export function assembleOptions(config: WuConfig, argv: string[]): CLIOptions {
  const m: ArgSet = parseArgs(argv)

  const goLiveDate = m.getSingle('--go-live-date')
  let goLiveImmediate = config.goLiveImmediate && !m.hasFlag('--schedule-go-live')
  if (!isBlank(goLiveDate)) goLiveImmediate = false

  let autoOsUpgrade = config.autoInstallDuringOSUpgrade
  if (m.hasFlag('--auto-install-os-upgrade')) autoOsUpgrade = true
  if (m.hasFlag('--no-auto-install-os-upgrade')) autoOsUpgrade = false

  let autoApplicable = config.autoInstallOnApplicableSystems
  if (m.hasFlag('--auto-install-applicable')) autoApplicable = true
  if (m.hasFlag('--no-auto-install-applicable')) autoApplicable = false

  const vtaCli = m.getMany('--visible-to-accounts')
  const visibleToAccounts = vtaCli.length > 0 ? vtaCli.map(parseIntStrict) : [...config.visibleToAccounts]

  const oemsCli = m.getMany('--affected-oems')
  const affectedOems = oemsCli.length > 0 ? [...oemsCli] : [...config.affectedOems]

  return {
    tenantId: m.getSingle('--tenant-id'),
    clientId: m.getSingle('--client-id'),
    clientSecret: m.getSingle('--client-secret'),
    productId: m.getSingle('--product-id'),
    submissionId: m.getSingle('--submission-id'),
    selectAll: m.hasFlag('--select-all'),
    dryRun: m.hasFlag('--dry-run'),
    outPath: firstNonEmpty(m.getSingle('--out'), 'shippinglabel.request.json'),
    destination: firstNonEmpty(m.getSingle('--destination'), config.destination),
    name: m.getSingle('--name'),
    goLiveImmediate,
    goLiveDate: isBlank(goLiveDate) ? '' : goLiveDate,
    visibleToAccounts,
    autoInstallDuringOSUpgrade: autoOsUpgrade,
    autoInstallOnApplicableSystems: autoApplicable,
    isDisclosureRestricted: m.hasFlag('--is-disclosure-restricted') || config.isDisclosureRestricted,
    publishToWindows10s: m.hasFlag('--publish-to-windows10s') || config.publishToWindows10s,
    msContact: firstNonEmpty(m.getSingle('--ms-contact'), config.msContact),
    validationsPerformed: firstNonEmpty(m.getSingle('--validations-performed'), config.validationsPerformed),
    affectedOems,
    isRebootRequired: m.hasFlag('--is-reboot-required') || config.isRebootRequired,
    isCoEngineered: m.hasFlag('--is-co-engineered') || config.isCoEngineered,
    isForUnreleasedHardware: m.hasFlag('--is-for-unreleased-hardware') || config.isForUnreleasedHardware,
    hasUiSoftware: m.hasFlag('--has-ui-software') || config.hasUiSoftware,
    businessJustification: firstNonEmpty(m.getSingle('--business-justification'), config.businessJustification),
    chids: [...m.getMany('--chids')],
    noUi: m.hasFlag('--no-ui'),
    offerFilter: !m.hasFlag('--no-filter'),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/cli/options.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/cli/options.ts WU-npm/test/cli/options.test.ts
git commit -m "feat(wu-npm): add CLIOptions assembly from config + args"
```

---

## Task 12: shippinglabel/payload

**Files:**
- Create: `WU-npm/src/shippinglabel/payload.ts`, `WU-npm/test/shippinglabel/payload.test.ts`

**Interfaces:**
- Consumes: `CLIOptions` from `cli/options`；`HardwareTarget` from `drivermeta/types`；`APIError` from `support/errors`；`or` from `support/strings`
- Produces: `buildPayload(opt: CLIOptions, name: string, targets: HardwareTarget[], chids: string[]): Record<string, any>`（chids 空抛 `APIError`）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/shippinglabel/payload.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildPayload } from '../../src/shippinglabel/payload.js'
import { assembleOptions } from '../../src/cli/options.js'
import { DEFAULT_CONFIG } from '../../src/config/store.js'
import { APIError } from '../../src/support/errors.js'
import type { HardwareTarget } from '../../src/drivermeta/types.js'

const target: HardwareTarget = {
  bundleId: 'b', bundleTag: 'B1', infId: 'inf', osCode: 'OS', pnpId: 'PNP',
  manufacturer: '', deviceDescription: '',
}

describe('buildPayload', () => {
  it('throws when chids empty', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, [])
    expect(() => buildPayload(opt, 'n', [target], [])).toThrow(APIError)
  })
  it('builds structure with defaults (auto-install true → approval block)', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, [])
    const p = buildPayload(opt, 'MyLabel', [target], ['chid-1'])
    expect(p.name).toBe('MyLabel')
    expect(p.destination).toBe('windowsUpdate')
    expect(p.publishingSpecifications.goLiveDate).toBe('')
    expect(p.publishingSpecifications.manualAcquisition).toBe(false)
    expect(p.publishingSpecifications.additionalInfoForMsApproval.microsoftContact).toBe(DEFAULT_CONFIG.msContact)
    expect(p.targeting.hardwareIds).toEqual([
      { bundleId: 'b', infId: 'inf', operatingSystemCode: 'OS', pnpString: 'PNP' },
    ])
    expect(p.targeting.chids).toEqual([{ chid: 'chid-1', distributionState: 'pendingAdd' }])
  })
  it('omits approval block and sets manualAcquisition when both auto-install false', () => {
    const opt = assembleOptions(DEFAULT_CONFIG, ['--no-auto-install-os-upgrade', '--no-auto-install-applicable'])
    const p = buildPayload(opt, 'n', [target], ['chid-1'])
    expect(p.publishingSpecifications.manualAcquisition).toBe(true)
    expect(p.publishingSpecifications.additionalInfoForMsApproval).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/shippinglabel/payload.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/shippinglabel/payload.ts`:
```ts
import type { CLIOptions } from '../cli/options.js'
import type { HardwareTarget } from '../drivermeta/types.js'
import { APIError } from '../support/errors.js'
import { or } from '../support/strings.js'

export function buildPayload(
  opt: CLIOptions,
  name: string,
  targets: HardwareTarget[],
  chids: string[],
): Record<string, any> {
  if (chids.length === 0) throw new APIError('CHIDs 必须至少提供 1 个（必填）。')

  const publishing: Record<string, any> = {
    goLiveDate: opt.goLiveImmediate ? '' : or(opt.goLiveDate, ''),
    visibleToAccounts: opt.visibleToAccounts,
    isAutoInstallDuringOSUpgrade: opt.autoInstallDuringOSUpgrade,
    isAutoInstallOnApplicableSystems: opt.autoInstallOnApplicableSystems,
    manualAcquisition: !opt.autoInstallDuringOSUpgrade && !opt.autoInstallOnApplicableSystems,
    isDisclosureRestricted: opt.isDisclosureRestricted,
    publishToWindows10s: opt.publishToWindows10s,
  }

  if (opt.autoInstallDuringOSUpgrade || opt.autoInstallOnApplicableSystems) {
    publishing.additionalInfoForMsApproval = {
      microsoftContact: opt.msContact,
      validationsPerformed: opt.validationsPerformed,
      affectedOems: opt.affectedOems,
      isRebootRequired: opt.isRebootRequired,
      isCoEngineered: opt.isCoEngineered,
      isForUnreleasedHardware: opt.isForUnreleasedHardware,
      hasUiSoftware: opt.hasUiSoftware,
      businessJustification: opt.businessJustification,
    }
  }

  const hardwareIds = targets.map((t) => ({
    bundleId: t.bundleId,
    infId: t.infId,
    operatingSystemCode: t.osCode,
    pnpString: t.pnpId,
  }))

  const chidArr = chids.map((c) => ({ chid: c, distributionState: 'pendingAdd' }))

  return {
    publishingSpecifications: publishing,
    targeting: { hardwareIds, chids: chidArr },
    name,
    destination: opt.destination,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/shippinglabel/payload.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/shippinglabel WU-npm/test/shippinglabel
git commit -m "feat(wu-npm): add shipping label payload builder"
```

---

## Task 13: auth/token（fetch + mock）

**Files:**
- Create: `WU-npm/src/auth/token.ts`, `WU-npm/test/auth/token.test.ts`

**Interfaces:**
- Consumes: `APIError` from `support/errors`；`isBlank` from `support/strings`
- Produces: `acquireToken(tenantId, clientId, clientSecret, opts?: { signal?: AbortSignal }): Promise<string>`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/auth/token.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { acquireToken } from '../../src/auth/token.js'
import { APIError } from '../../src/support/errors.js'

afterEach(() => vi.restoreAllMocks())

function mockFetch(status: number, body: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })))
}

describe('acquireToken', () => {
  it('returns access_token on 200', async () => {
    mockFetch(200, JSON.stringify({ access_token: 'TOK' }))
    await expect(acquireToken('t', 'c', 's')).resolves.toBe('TOK')
  })
  it('throws APIError on non-2xx', async () => {
    mockFetch(400, 'bad')
    await expect(acquireToken('t', 'c', 's')).rejects.toThrow(APIError)
  })
  it('throws when access_token missing', async () => {
    mockFetch(200, JSON.stringify({ foo: 'bar' }))
    await expect(acquireToken('t', 'c', 's')).rejects.toThrow(APIError)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/auth/token.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/auth/token.ts`:
```ts
import { APIError } from '../support/errors.js'
import { isBlank } from '../support/strings.js'

export async function acquireToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/token`
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    resource: 'https://manage.devcenter.microsoft.com',
  })

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: opts.signal,
  })

  const body = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`获取 token 失败: ${resp.status}\n${body}`)
  }

  let obj: any
  try {
    obj = JSON.parse(body)
  } catch (e) {
    throw new APIError('token 响应不是合法 JSON: ' + (e as Error).message)
  }

  const token = typeof obj.access_token === 'string' ? obj.access_token : ''
  if (isBlank(token)) throw new APIError('响应缺少 access_token: ' + body)
  return token
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/auth/token.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/auth WU-npm/test/auth
git commit -m "feat(wu-npm): add OAuth token acquisition"
```

---

## Task 14: devcenter（client + submission + metadata + shippingLabel）

**Files:**
- Create: `WU-npm/src/devcenter/client.ts`, `WU-npm/src/devcenter/submission.ts`, `WU-npm/src/devcenter/metadata.ts`, `WU-npm/src/devcenter/shippingLabel.ts`, `WU-npm/test/devcenter/submission.test.ts`, `WU-npm/test/devcenter/api.test.ts`

**Interfaces:**
- Consumes: `APIError` from `support/errors`；`isBlank` from `support/strings`
- Produces:
  - `const BASE_API = 'https://manage.devcenter.microsoft.com/v2.0/my/hardware'`
  - `getSubmission(token, productId, submissionId, opts?): Promise<Record<string,any>>`
  - `findDriverMetadataURL(submission): string`（找不到抛 `APIError`）
  - `printWorkflowStatus(submission): void`
  - `downloadDriverMetadata(token, url, opts?): Promise<Record<string,any>>`
  - `createShippingLabel(token, productId, submissionId, body, opts?): Promise<Record<string,any>>`

- [ ] **Step 1: 写失败测试**

`WU-npm/test/devcenter/submission.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { findDriverMetadataURL } from '../../src/devcenter/submission.js'
import { APIError } from '../../src/support/errors.js'

describe('findDriverMetadataURL', () => {
  it('finds from downloads.items', () => {
    const sub = { downloads: { items: [{ type: 'driverMetadata', url: 'http://x/meta' }] } }
    expect(findDriverMetadataURL(sub)).toBe('http://x/meta')
  })
  it('finds from links rel', () => {
    const sub = { links: [{ rel: 'driverMetadata', href: 'http://x/href' }] }
    expect(findDriverMetadataURL(sub)).toBe('http://x/href')
  })
  it('throws when absent', () => {
    expect(() => findDriverMetadataURL({})).toThrow(APIError)
  })
})
```

`WU-npm/test/devcenter/api.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getSubmission } from '../../src/devcenter/submission.js'
import { createShippingLabel } from '../../src/devcenter/shippingLabel.js'
import { APIError } from '../../src/support/errors.js'

afterEach(() => vi.restoreAllMocks())

describe('devcenter api', () => {
  it('getSubmission returns object on 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })))
    await expect(getSubmission('tok', 'P', 'S')).resolves.toEqual({ id: 1 })
  })
  it('getSubmission throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })))
    await expect(getSubmission('tok', 'P', 'S')).rejects.toThrow(APIError)
  })
  it('createShippingLabel returns {} on 2xx non-json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 201 })))
    await expect(createShippingLabel('tok', 'P', 'S', {})).resolves.toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/devcenter`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/devcenter/client.ts`:
```ts
import { APIError } from '../support/errors.js'

export const BASE_API = 'https://manage.devcenter.microsoft.com/v2.0/my/hardware'

export interface CallOpts {
  signal?: AbortSignal
}

export async function fetchText(
  url: string,
  init: RequestInit,
  errPrefix: string,
): Promise<string> {
  const resp = await fetch(url, init)
  const body = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`${errPrefix} 失败: ${resp.status}\n${body}`)
  }
  return body
}
```

`WU-npm/src/devcenter/submission.ts`:
```ts
import { APIError } from '../support/errors.js'
import { isBlank } from '../support/strings.js'
import { BASE_API, fetchText, type CallOpts } from './client.js'

export async function getSubmission(
  token: string,
  productId: string,
  submissionId: string,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const url = `${BASE_API}/products/${productId}/submissions/${submissionId}`
  const body = await fetchText(
    url,
    { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: opts.signal },
    'GET submission',
  )
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new APIError('submission 响应不是 JSON object: ' + (e as Error).message)
  }
}

export function printWorkflowStatus(submission: Record<string, any>): void {
  const wf = submission?.['workflowStatus']
  if (!wf || typeof wf !== 'object') return
  const step = typeof wf.currentStep === 'string' ? wf.currentStep : ''
  const state = typeof wf.state === 'string' ? wf.state : ''
  if (!isBlank(step) || !isBlank(state)) {
    console.log(`  workflow: step=${step} state=${state}`)
  }
}

export function findDriverMetadataURL(submission: Record<string, any>): string {
  const items = submission?.downloads?.items
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && typeof it === 'object' && String(it.type).toLowerCase() === 'drivermetadata') {
        if (!isBlank(it.url)) return it.url
      }
    }
  }
  const links = submission?.links
  if (Array.isArray(links)) {
    for (const lk of links) {
      if (lk && typeof lk === 'object' && String(lk.rel).toLowerCase() === 'drivermetadata') {
        if (!isBlank(lk.href)) return lk.href
      }
    }
  }
  throw new APIError('submission 中未找到 driverMetadata URL（downloads.items 或 links 均没有）')
}
```

`WU-npm/src/devcenter/metadata.ts`:
```ts
import { APIError } from '../support/errors.js'
import { fetchText, type CallOpts } from './client.js'

export async function downloadDriverMetadata(
  token: string,
  url: string,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (url.toLowerCase().includes('manage.devcenter.microsoft.com')) {
    headers.Authorization = `Bearer ${token}`
  }
  const body = await fetchText(url, { method: 'GET', headers, signal: opts.signal }, 'GET driverMetadata')
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new APIError('driverMetadata 不是合法 JSON:\n' + (e as Error).message)
  }
}
```

`WU-npm/src/devcenter/shippingLabel.ts`:
```ts
import { APIError } from '../support/errors.js'
import { BASE_API, type CallOpts } from './client.js'

export async function createShippingLabel(
  token: string,
  productId: string,
  submissionId: string,
  body: Record<string, any>,
  opts: CallOpts = {},
): Promise<Record<string, any>> {
  const url = `${BASE_API}/products/${productId}/submissions/${submissionId}/shippingLabels`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  const text = await resp.text()
  if (resp.status < 200 || resp.status >= 300) {
    throw new APIError(`POST /shippingLabels 失败: ${resp.status}\n${text}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/devcenter`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/devcenter WU-npm/test/devcenter
git commit -m "feat(wu-npm): add Dev Center API client"
```

---

## Task 15: ui/selectState（多选纯 reducer）

**Files:**
- Create: `WU-npm/src/ui/selectState.ts`, `WU-npm/test/ui/selectState.test.ts`

**Interfaces:**
- Produces:
  - `interface SelectState { cursor: number; top: number; selected: Set<number>; count: number }`
  - `initState(count: number): SelectState`
  - `viewHeight(termHeight: number, legendCount: number): number`
  - `moveCursor(s, delta, viewH): SelectState`（含滚动 top 更新，clamp 到 [0,count-1]）
  - `jumpTo(s, index, viewH): SelectState`
  - `toggle(s): SelectState`（切换 cursor 项）
  - `selectAll(s): SelectState` / `selectNone(s): SelectState`
  - `confirmed(s): number[]`（升序 selected 索引）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/ui/selectState.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { initState, viewHeight, moveCursor, jumpTo, toggle, selectAll, selectNone, confirmed } from '../../src/ui/selectState.js'

describe('selectState', () => {
  it('viewHeight follows Go formula', () => {
    // height-6, +1 when legendCount<=1, min 3
    expect(viewHeight(20, 2)).toBe(14)
    expect(viewHeight(20, 1)).toBe(15)
    expect(viewHeight(5, 1)).toBe(3)
  })
  it('moveCursor clamps and scrolls', () => {
    let s = initState(100)
    s = moveCursor(s, -1, 10)
    expect(s.cursor).toBe(0)
    s = moveCursor(s, 50, 10)
    expect(s.cursor).toBe(50)
    expect(s.top).toBe(50 - 10 + 1)
  })
  it('jumpTo end', () => {
    let s = jumpTo(initState(30), 29, 10)
    expect(s.cursor).toBe(29)
  })
  it('toggle / selectAll / selectNone / confirmed', () => {
    let s = initState(3)
    s = toggle(s) // index 0
    expect(confirmed(s)).toEqual([0])
    s = selectAll(s)
    expect(confirmed(s)).toEqual([0, 1, 2])
    s = selectNone(s)
    expect(confirmed(s)).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/ui/selectState.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/ui/selectState.ts`:
```ts
export interface SelectState {
  cursor: number
  top: number
  selected: Set<number>
  count: number
}

export function initState(count: number): SelectState {
  return { cursor: 0, top: 0, selected: new Set(), count }
}

export function viewHeight(termHeight: number, legendCount: number): number {
  let h = termHeight
  if (h < 12) h = 12
  let viewH = h - 6
  if (legendCount <= 1) viewH += 1
  if (viewH < 3) viewH = 3
  return viewH
}

function clampScroll(s: SelectState, viewH: number): SelectState {
  let top = s.top
  if (s.cursor < top) top = s.cursor
  if (s.cursor >= top + viewH) top = s.cursor - viewH + 1
  return { ...s, top }
}

export function moveCursor(s: SelectState, delta: number, viewH: number): SelectState {
  let cursor = s.cursor + delta
  if (cursor < 0) cursor = 0
  if (cursor > s.count - 1) cursor = s.count - 1
  return clampScroll({ ...s, cursor }, viewH)
}

export function jumpTo(s: SelectState, index: number, viewH: number): SelectState {
  let cursor = index
  if (cursor < 0) cursor = 0
  if (cursor > s.count - 1) cursor = s.count - 1
  return clampScroll({ ...s, cursor }, viewH)
}

export function toggle(s: SelectState): SelectState {
  const selected = new Set(s.selected)
  if (selected.has(s.cursor)) selected.delete(s.cursor)
  else selected.add(s.cursor)
  return { ...s, selected }
}

export function selectAll(s: SelectState): SelectState {
  const selected = new Set<number>()
  for (let i = 0; i < s.count; i++) selected.add(i)
  return { ...s, selected }
}

export function selectNone(s: SelectState): SelectState {
  return { ...s, selected: new Set() }
}

export function confirmed(s: SelectState): number[] {
  return [...s.selected].sort((a, b) => a - b)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/ui/selectState.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/ui/selectState.ts WU-npm/test/ui/selectState.test.ts
git commit -m "feat(wu-npm): add multiselect state reducer"
```

---

## Task 16: ui/fallbackSelect（--no-ui 序号选择）

**Files:**
- Create: `WU-npm/src/ui/fallbackSelect.ts`, `WU-npm/test/ui/fallbackSelect.test.ts`

**Interfaces:**
- Produces:
  - `parseIndexExpr(expr: string, n: number): number[]`（`a`/`all`/`*` 全选；`1,3,5`；`2-6`；非法抛 `Error`）
  - `promptIndexSelection(title: string, items: string[], allowEmpty: boolean, multi: boolean): Promise<number[]>`（读 stdin，交互；本任务只对 `parseIndexExpr` 写单测）

- [ ] **Step 1: 写失败测试**

`WU-npm/test/ui/fallbackSelect.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseIndexExpr } from '../../src/ui/fallbackSelect.js'

describe('parseIndexExpr', () => {
  it('all keywords', () => {
    expect(parseIndexExpr('a', 3)).toEqual([0, 1, 2])
    expect(parseIndexExpr('*', 2)).toEqual([0, 1])
  })
  it('comma list (0-based, deduped, sorted)', () => {
    expect(parseIndexExpr('1,3,3', 5)).toEqual([0, 2])
  })
  it('range', () => {
    expect(parseIndexExpr('2-4', 10)).toEqual([1, 2, 3])
  })
  it('reversed range', () => {
    expect(parseIndexExpr('4-2', 10)).toEqual([1, 2, 3])
  })
  it('throws on garbage', () => {
    expect(() => parseIndexExpr('x', 3)).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd WU-npm && npx vitest run test/ui/fallbackSelect.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`WU-npm/src/ui/fallbackSelect.ts`:
```ts
import { createInterface } from 'node:readline'

export function parseIndexExpr(exprRaw: string, n: number): number[] {
  const expr = exprRaw.trim().toLowerCase()
  if (expr === 'a' || expr === 'all' || expr === '*') {
    return Array.from({ length: n }, (_, i) => i)
  }
  if (expr === '') return []

  const chosen = new Set<number>()
  const reRange = /^(\d+)\s*-\s*(\d+)$/
  const reNum = /^\d+$/

  for (const raw of expr.split(',')) {
    const t = raw.trim()
    if (t === '') continue
    const mr = reRange.exec(t)
    if (mr) {
      let a = parseInt(mr[1], 10)
      let b = parseInt(mr[2], 10)
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b; i++) if (i >= 1 && i <= n) chosen.add(i - 1)
      continue
    }
    if (reNum.test(t)) {
      const i = parseInt(t, 10)
      if (i >= 1 && i <= n) chosen.add(i - 1)
      continue
    }
    throw new Error('无法解析: ' + t)
  }
  return [...chosen].sort((a, b) => a - b)
}

export function promptIndexSelection(
  title: string,
  items: string[],
  allowEmpty: boolean,
  multi: boolean,
): Promise<number[]> {
  console.log('\n' + '='.repeat(100))
  console.log(title)
  console.log('-'.repeat(100))
  if (items.length === 0) {
    console.log('(无可选项)')
    return Promise.resolve([])
  }
  items.forEach((it, i) => console.log(`[${String(i + 1).padStart(5)}] ${it}`))
  console.log('-'.repeat(100))

  let hint = multi ? '输入 a 全选；支持 1,3,5 或 2-6' : '输入序号'
  if (allowEmpty) hint += '；回车=不选'

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (): Promise<number[]> =>
    new Promise((resolve) => {
      rl.question(hint + ': ', (answer) => {
        const expr = answer.trim()
        if (allowEmpty && expr === '') return resolve([])
        try {
          let idxs: number[]
          if (multi) {
            idxs = parseIndexExpr(expr, items.length)
          } else {
            const num = parseInt(expr, 10)
            if (Number.isNaN(num)) throw new Error('需要整数序号')
            idxs = [num - 1]
          }
          if (idxs.some((i) => i < 0 || i >= items.length)) {
            console.log('序号超范围。')
            return resolve(ask())
          }
          if (!allowEmpty && idxs.length === 0) {
            console.log('至少选择一个。')
            return resolve(ask())
          }
          resolve(idxs)
        } catch (e) {
          console.log('输入有误：' + (e as Error).message)
          resolve(ask())
        }
      })
    })

  return ask().finally(() => rl.close())
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd WU-npm && npx vitest run test/ui/fallbackSelect.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/ui/fallbackSelect.ts WU-npm/test/ui/fallbackSelect.test.ts
git commit -m "feat(wu-npm): add no-ui index selection"
```

---

## Task 17: ui/index（clack 封装 + 配色）

**Files:**
- Create: `WU-npm/src/ui/index.ts`
- Test: 手动验证（交互式 I/O，不做自动化单测）

**Interfaces:**
- Consumes: `@clack/prompts`、`picocolors`、`support/errors`（`CanceledError`）
- Produces（供 `app/run` 使用）：
  - `banner(tool: string, version: string): void`
  - `section(title: string, current: number, total: number): void`
  - `item(label: string, value?: string): void`
  - `endLine(label: string): void`
  - `ok(msg) / warn(msg) / fail(msg) / info(msg): void`
  - `errorInside(msg: string): void`（`│ ❌ ...`）
  - `prompt(question: string, def?: string): Promise<string>`（取消抛 `CanceledError`）
  - `promptSecret(question: string): Promise<string>`
  - `promptYesNo(question: string, def: boolean): Promise<boolean>`
  - `spin<T>(label: string, task: () => Promise<T>): Promise<T>`
  - `COLOR_FN: ((s: string) => string)[]`（长度 10，索引对应 `drivermeta` COLORS 调色板 → picocolors 函数）

- [ ] **Step 1: 实现**

`WU-npm/src/ui/index.ts`:
```ts
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { CanceledError } from '../support/errors.js'

const gray = pc.gray
const line = '────────────────────────────────────────────────'

// 调色板：索引与 drivermeta/types COLORS 顺序一致
// Cyan, Yellow, Green, Magenta, Blue, White, DarkCyan, DarkYellow, DarkGreen, DarkMagenta
export const COLOR_FN: ((s: string) => string)[] = [
  pc.cyan, pc.yellow, pc.green, pc.magenta, pc.blue, pc.white,
  (s) => pc.dim(pc.cyan(s)),
  (s) => pc.dim(pc.yellow(s)),
  (s) => pc.dim(pc.green(s)),
  (s) => pc.dim(pc.magenta(s)),
]

function guard<T>(v: T | symbol): T {
  if (p.isCancel(v)) throw new CanceledError()
  return v as T
}

export function banner(tool: string, version: string): void {
  console.log(`\n ${pc.cyan('⛅️')} ${pc.bold(tool)} ${gray(version)}`)
  console.log(gray(line))
  console.log('Hardware Dashboard API - Shipping Label Creator')
  console.log(' ')
  console.log('                             liuty24@lenovo.com')
  console.log(gray(line))
}

export function section(title: string, current: number, total: number): void {
  console.log('')
  console.log(`${gray('╭')} ${pc.rgb ? title : title} ${gray(`Step ${current} of ${total}`)}`)
  console.log(gray('│'))
}

export function item(label: string, value?: string): void {
  console.log(`${gray('├')} ${label}`)
  if (value !== undefined) console.log(`${gray('│')} ${gray('dir')} ${value}`)
  console.log(gray('│'))
}

export function endLine(label: string): void {
  console.log(`${gray('╰')} ${label}`)
}

export function info(msg: string): void { console.log(`${pc.blue('ℹ')} ${msg}`) }
export function ok(msg: string): void { console.log(`${pc.green('✅')} ${msg}`) }
export function warn(msg: string): void { console.log(`${pc.yellow('⚠️')} ${msg}`) }
export function fail(msg: string): void { console.log(`${pc.red('❌')} ${msg}`) }
export function errorInside(msg: string): void { console.log(`${gray('│')} ${pc.red('❌')} ${msg}`) }

export async function prompt(question: string, def = ''): Promise<string> {
  const v = guard(await p.text({ message: question, defaultValue: def, placeholder: def }))
  return (v ?? '') === '' ? def : (v as string)
}

export async function promptSecret(question: string): Promise<string> {
  return guard(await p.password({ message: question })) as string
}

export async function promptYesNo(question: string, def: boolean): Promise<boolean> {
  return guard(await p.confirm({ message: question, initialValue: def })) as boolean
}

export async function spin<T>(label: string, task: () => Promise<T>): Promise<T> {
  const s = p.spinner()
  s.start(label)
  try {
    const result = await task()
    s.stop(label)
    return result
  } catch (e) {
    s.stop(label)
    throw e
  }
}
```

> 注：`section` 里对 orange 标题的处理简化为直接输出 title（picocolors 无稳定 RGB API 时）。若 picocolors 版本支持，可用 `pc.yellow(title)` 近似 Wrangler 橙色。删除 `pc.rgb ? ... : ...` 占位、改为 `pc.yellow(title)`：见 Step 2。

- [ ] **Step 2: 修正 section 标题着色**

将 `section` 中的
```ts
  console.log(`${gray('╭')} ${pc.rgb ? title : title} ${gray(`Step ${current} of ${total}`)}`)
```
改为：
```ts
  console.log(`${gray('╭')} ${pc.yellow(title)} ${gray(`Step ${current} of ${total}`)}`)
```

- [ ] **Step 3: 构建校验（类型检查）**

Run: `cd WU-npm && npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add WU-npm/src/ui/index.ts
git commit -m "feat(wu-npm): add clack-based UI wrappers"
```

---

## Task 18: ui/multiselect（自定义多选渲染，含热键）

**Files:**
- Create: `WU-npm/src/ui/multiselect.ts`, `WU-npm/src/support/terminal.ts`
- Test: 手动验证（raw TTY 交互）；纯状态已在 Task 15 覆盖

**Interfaces:**
- Consumes: `selectState`（Task 15）；`COLOR_FN`（Task 17）；`CanceledError`；`ListItem`（`drivermeta/listItems`）；`BundleLegend`（`drivermeta/types`）
- Produces:
  - `interface Legend { tag: string; color: number; itemCount: number; sampleInfs: string[] }`
  - `runMultiSelectLegend(title: string, legends: Legend[], items: ListItem[]): Promise<number[]>`（返回选中索引；取消抛 `CanceledError`）
  - `support/terminal.ts`：`termSize(): { width: number; height: number }`（best-effort，默认 80×24）

- [ ] **Step 1: 实现 terminal 尺寸**

`WU-npm/src/support/terminal.ts`:
```ts
export function termSize(): { width: number; height: number } {
  const width = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80
  const height = process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : 24
  return { width, height }
}
```

- [ ] **Step 2: 实现自定义多选**

`WU-npm/src/ui/multiselect.ts`:
```ts
import pc from 'picocolors'
import { emitKeypress } from './keypress.js'
import { COLOR_FN } from './index.js'
import { termSize } from '../support/terminal.js'
import { CanceledError } from '../support/errors.js'
import type { ListItem } from '../drivermeta/listItems.js'
import {
  initState, viewHeight, moveCursor, jumpTo, toggle, selectAll, selectNone, confirmed,
  type SelectState,
} from './selectState.js'

export interface Legend {
  tag: string
  color: number
  itemCount: number
  sampleInfs: string[]
}

function truncate(s: string, width: number): string {
  const r = [...s]
  if (r.length <= width) return s
  if (width <= 1) return r.slice(0, width).join('')
  return r.slice(0, width - 1).join('')
}

function render(title: string, legends: Legend[], items: ListItem[], s: SelectState): void {
  const { width, height } = termSize()
  const w = Math.max(width, 60)
  const h = Math.max(height, 12)

  const out: string[] = []
  out.push(truncate(title, w))

  if (legends.length > 1) {
    let head = 'Bundles: '
    head += legends
      .map((l) => {
        const hint = l.sampleInfs.length > 0 ? ` (${l.sampleInfs.join(', ')})` : ''
        return COLOR_FN[l.color % COLOR_FN.length](`${l.tag}:${l.itemCount}${hint}`)
      })
      .join('  ')
    out.push(head)
  }

  out.push(truncate('↑↓移动  PgUp/PgDn跳转  Home/End  Space勾选  a全选  n清空  Enter确认  q退出', w))
  out.push('-'.repeat(Math.min(w, 120)))

  const viewH = viewHeight(h, legends.length)
  for (let row = 0; row < viewH; row++) {
    const idx = s.top + row
    if (idx >= items.length) break
    const it = items[idx]
    const mark = s.selected.has(idx) ? '[x]' : '[ ]'
    const prefix = `${mark} ${String(idx + 1).padStart(5)} `
    const lineText = truncate(prefix + it.text, w)
    const colored = COLOR_FN[it.color % COLOR_FN.length](lineText)
    if (idx === s.cursor) out.push(pc.inverse(colored))
    else out.push(colored)
  }

  out.push('-'.repeat(Math.min(w, 120)))
  out.push(`已选 ${s.selected.size}/${items.length} | 当前 ${s.cursor + 1}/${items.length}`)

  // 清屏并重绘
  process.stdout.write('\x1b[2J\x1b[H' + out.join('\n') + '\n')
}

export function runMultiSelectLegend(
  title: string,
  legends: Legend[],
  items: ListItem[],
): Promise<number[]> {
  if (items.length === 0) return Promise.reject(new CanceledError('没有可选项'))

  return new Promise<number[]>((resolve, reject) => {
    let s = initState(items.length)
    const { height } = termSize()
    const viewH = viewHeight(Math.max(height, 12), legends.length)

    process.stdout.write('\x1b[?25l') // hide cursor
    const cleanup = emitKeypress((key) => {
      switch (key.name) {
        case 'up': s = moveCursor(s, -1, viewH); break
        case 'down': s = moveCursor(s, 1, viewH); break
        case 'pageup': s = moveCursor(s, -10, viewH); break
        case 'pagedown': s = moveCursor(s, 10, viewH); break
        case 'home': s = jumpTo(s, 0, viewH); break
        case 'end': s = jumpTo(s, items.length - 1, viewH); break
        case 'space': s = toggle(s); break
        case 'a': s = selectAll(s); break
        case 'n': s = selectNone(s); break
        case 'q':
        case 'escape':
          finish()
          return reject(new CanceledError())
        case 'return':
          if (s.selected.size === 0) return
          finish()
          return resolve(confirmed(s))
        default:
          return
      }
      render(title, legends, items, s)
    })

    function finish(): void {
      cleanup()
      process.stdout.write('\x1b[?25h') // show cursor
    }

    render(title, legends, items, s)
  })
}
```

- [ ] **Step 3: 实现 keypress 适配器**

`WU-npm/src/ui/keypress.ts`:
```ts
import readline from 'node:readline'

export interface Key {
  name: string
  ctrl: boolean
}

// 返回 cleanup 函数；把 stdin 置于 raw+keypress 模式，回调标准化按键名
export function emitKeypress(onKey: (key: Key) => void): () => void {
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  const handler = (str: string, key: readline.Key) => {
    let name = key?.name ?? ''
    if (str === ' ') name = 'space'
    if (key?.ctrl && key?.name === 'c') {
      cleanup()
      process.exit(130)
    }
    onKey({ name, ctrl: !!key?.ctrl })
  }

  process.stdin.on('keypress', handler)
  process.stdin.resume()

  const cleanup = () => {
    process.stdin.off('keypress', handler)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdin.pause()
  }
  return cleanup
}
```

- [ ] **Step 4: 类型检查**

Run: `cd WU-npm && npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add WU-npm/src/ui/multiselect.ts WU-npm/src/ui/keypress.ts WU-npm/src/support/terminal.ts
git commit -m "feat(wu-npm): add custom multiselect with hotkeys"
```

---

## Task 19: app/run（4 步编排）

**Files:**
- Create: `WU-npm/src/app/run.ts`
- Test: 手动/集成（`--dry-run` 走通）

**Interfaces:**
- Consumes: 全部前述模块
- Produces: `run(argv: string[]): Promise<number>`（返回退出码）

**编排（对齐 Go `app.Run`）：**
1. banner → section Initialize → loadConfig → loadCredential → CLI 覆盖 → 缺失则 prompt → saveCredential → spin acquireToken。
2. section Submission → prompt productId（支持 shortcut）+ submissionId → 校验非空（缺失返回 2）→ spin getSubmission → printWorkflowStatus。
3. section Metadata → findDriverMetadataURL → downloadDriverMetadata → parse → 打印候选数 → 若 0 返回 1 → 选择（--select-all / 多选，含 >300 且 offerFilter 时关键字过滤）→ 空选返回 1。
4. section Create → prompt name（默认 `{OEM Name}: {Project Name}`）→ chids（--chids 校验 或 循环 prompt）→ buildPayload → 写 outPath → --dry-run 止步返回 0 → spin createShippingLabel → 打印 partner URL → prompt 回车退出 → 返回 0。
- 错误：`CanceledError` → fail + 返回 130；其它 → 打印 stderr + 返回 exitCode（1）。

- [ ] **Step 1: 实现**

`WU-npm/src/app/run.ts`:
```ts
import { writeFileSync } from 'node:fs'
import { loadConfig } from '../config/store.js'
import { loadCredential, saveCredential } from '../config/credentials.js'
import { assembleOptions, type CLIOptions } from '../cli/options.js'
import { firstNonEmpty, isBlank, containsLower } from '../support/strings.js'
import { isCanceled, CanceledError } from '../support/errors.js'
import { tryParseSubmissionShortcut } from '../support/submissionShortcut.js'
import { acquireToken } from '../auth/token.js'
import { getSubmission, findDriverMetadataURL, printWorkflowStatus } from '../devcenter/submission.js'
import { downloadDriverMetadata } from '../devcenter/metadata.js'
import { createShippingLabel } from '../devcenter/shippingLabel.js'
import { parse, type ParseResult } from '../drivermeta/parse.js'
import type { HardwareTarget } from '../drivermeta/types.js'
import { buildListItems } from '../drivermeta/listItems.js'
import { normalizeCHIDsRequired } from '../validate/chid.js'
import { buildPayload } from '../shippinglabel/payload.js'
import { termSize } from '../support/terminal.js'
import { runMultiSelectLegend, type Legend } from '../ui/multiselect.js'
import { promptIndexSelection } from '../ui/fallbackSelect.js'
import * as ui from '../ui/index.js'

const PARTNER = 'https://partner.microsoft.com/en-us/dashboard/hardware/driver/%p/submission/%s/ShippingLabel/%d'

export async function run(argv: string[]): Promise<number> {
  const config = loadConfig()
  const opt = assembleOptions(config, argv)

  ui.banner('WU', '1.0.0')
  ui.endLine('Start')

  try {
    // Step 1: Auth
    ui.section('Initialize', 1, 4)
    ui.item('Loading credentials', 'credential.enc')
    const cred = loadCredential()
    opt.tenantId = firstNonEmpty(cred.tenantId, opt.tenantId)
    opt.clientId = firstNonEmpty(cred.clientId, opt.clientId)
    opt.clientSecret = firstNonEmpty(cred.clientSecret, opt.clientSecret)

    if (isBlank(opt.tenantId)) opt.tenantId = await ui.prompt('tenant_id', '')
    if (isBlank(opt.clientId)) opt.clientId = await ui.prompt('client_id', '')
    if (isBlank(opt.clientSecret)) opt.clientSecret = await ui.promptSecret('client_secret')

    saveCredential({ tenantId: opt.tenantId, clientId: opt.clientId, clientSecret: opt.clientSecret })

    const token = await ui.spin('Acquiring token...', () =>
      acquireToken(opt.tenantId, opt.clientId, opt.clientSecret),
    )
    ui.ok('Token acquired')

    // Step 2: Submission
    ui.section('Submission Selection', 2, 4)
    if (isBlank(opt.productId)) {
      const raw = await ui.prompt('productId (or submission shortcut)', '')
      const parsed = tryParseSubmissionShortcut(raw)
      if (parsed) {
        opt.productId = parsed.productId
        if (isBlank(opt.submissionId)) opt.submissionId = parsed.submissionId
      } else {
        opt.productId = raw
      }
    }
    if (isBlank(opt.submissionId)) opt.submissionId = await ui.prompt('submissionId', '')

    if (isBlank(opt.tenantId) || isBlank(opt.clientId) || isBlank(opt.clientSecret) ||
        isBlank(opt.productId) || isBlank(opt.submissionId)) {
      ui.fail('tenant_id / client_id / client_secret / product_id / submission_id cannot be empty')
      return 2
    }

    const submission = await ui.spin('Fetching submission...', () =>
      getSubmission(token, opt.productId, opt.submissionId),
    )
    ui.ok('Submission fetched')
    printWorkflowStatus(submission)

    // Step 3: Metadata
    ui.section('Metadata Analysis', 3, 4)
    const url = await ui.spin('Resolving metadata URL...', async () => findDriverMetadataURL(submission))
    const metaRoot = await ui.spin('Downloading driverMetadata...', () => downloadDriverMetadata(token, url))
    const parsed = await ui.spin('Parsing candidates...', async () => parse(metaRoot))
    ui.ok(`Metadata OK: candidates=${parsed.targets.length}`)
    if (parsed.targets.length === 0) {
      ui.fail('No candidates found in metadata')
      return 1
    }

    ui.section('Selection', 3, 4)
    const selected = await selectTargets(parsed, opt)
    if (selected.length === 0) {
      ui.fail('No hardwareIds selected')
      return 1
    }
    ui.ok(`Selected ${selected.length} hardwareIds`)
    ui.endLine('Selected')

    // Step 4: Create
    ui.section('Create Shipping Label', 4, 4)
    let name = opt.name
    if (isBlank(name)) name = await ui.prompt('Shipping label name', '{OEM Name}: {Project Name}')

    let chids: string[]
    if (opt.chids.length > 0) {
      chids = normalizeCHIDsRequired(opt.chids)
    } else {
      chids = await promptChidsLoop()
    }

    const bodyObj = buildPayload(opt, name, selected, chids)
    const outPath = firstNonEmpty(opt.outPath, 'shippinglabel.request.json')
    writeFileSync(outPath, JSON.stringify(bodyObj, null, 2))
    ui.ok('Request saved: ' + outPath)

    if (opt.dryRun) {
      ui.endLine('--dry-run (no POST)')
      return 0
    }

    const resp = await ui.spin('Creating shipping label...', () =>
      createShippingLabel(token, opt.productId, opt.submissionId, bodyObj),
    )
    if (typeof resp.id === 'number' || typeof resp.id === 'string') {
      const shippingURL = PARTNER.replace('%p', opt.productId).replace('%s', opt.submissionId).replace('%d', String(resp.id))
      ui.ok('Created: ' + shippingURL)
    } else {
      ui.ok('Created (id not found in response)')
    }

    ui.endLine('Complete')
    await ui.prompt('Press Enter to exit', '')
    return 0
  } catch (e) {
    if (isCanceled(e)) {
      ui.fail('User canceled or timeout.')
      return 130
    }
    process.stderr.write((e as Error).message + '\n')
    return 1
  }
}

async function selectTargets(parsed: ParseResult, opt: CLIOptions): Promise<HardwareTarget[]> {
  if (opt.selectAll) {
    ui.ok(`--select-all: selected ${parsed.targets.length} hardwareIds`)
    return [...parsed.targets]
  }

  let working = parsed.targets
  if (working.length > 300 && opt.offerFilter) {
    if (await ui.promptYesNo(`Too many candidates (${working.length}). Filter by keyword?`, true)) {
      const kw = await ui.prompt('Filter keyword (INF/OS/PNP...)', '')
      if (!isBlank(kw)) {
        const low = kw.toLowerCase()
        working = working.filter((t) =>
          containsLower(t.infId, low) || containsLower(t.osCode, low) || containsLower(t.pnpId, low) ||
          containsLower(t.manufacturer, low) || containsLower(t.deviceDescription, low),
        )
      }
    }
  }
  if (working.length === 0) throw new CanceledError('No candidates after filter.')

  const { width } = termSize()
  const items = buildListItems(working, parsed.ui, width)

  let idxs: number[]
  if (opt.noUi) {
    idxs = await promptIndexSelection('Select targets', items.map((i) => i.text), false, true)
  } else {
    const legends: Legend[] = parsed.ui.legends.map((l) => ({
      tag: l.tag, color: l.color, itemCount: l.itemCount, sampleInfs: l.sampleInfs,
    }))
    idxs = await runMultiSelectLegend('Select targets (Space to toggle, Enter to confirm)', legends, items)
  }
  return idxs.map((i) => working[i])
}

async function promptChidsLoop(): Promise<string[]> {
  for (;;) {
    const raw = await ui.prompt('CHIDs (Required, comma separated)', '')
    const parts = raw.split(',').map((p) => p.trim()).filter((p) => p !== '')
    try {
      return normalizeCHIDsRequired(parts)
    } catch (e) {
      ui.errorInside((e as Error).message)
    }
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `cd WU-npm && npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add WU-npm/src/app/run.ts
git commit -m "feat(wu-npm): add app orchestration"
```

---

## Task 20: index.ts 入口 + 构建 + 端到端 --dry-run 手测

**Files:**
- Modify: `WU-npm/src/index.ts`

**Interfaces:**
- Consumes: `app/run`
- Produces: bin 入口，`process.exit(code)`

- [ ] **Step 1: 实现入口**

`WU-npm/src/index.ts`:
```ts
import { run } from './app/run.js'

run(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write((e as Error).message + '\n')
    process.exit(1)
  })
```

- [ ] **Step 2: 全量测试 + 构建**

Run: `cd WU-npm && npm test && npm run build`
Expected: 全部单测 PASS；`dist/index.js` 生成且首行 shebang。

- [ ] **Step 3: 端到端 dry-run 手测**

Run:
```bash
cd WU-npm && node dist/index.js --help >/dev/null 2>&1 || true
# 交互式冒烟：提供假凭据与假 product/submission，确认在 acquireToken 处以网络错误优雅退出（返回码 1）
```
Expected: banner 与 Step 1 正常渲染；无凭据时提示输入；网络失败时打印错误并退出码 1（非崩溃堆栈）。

> 说明：完整 happy-path 需真实 Dev Center 凭据，无法在此自动化；此步只验证 CLI 能启动、渲染、优雅错误处理。

- [ ] **Step 4: Commit**

```bash
git add WU-npm/src/index.ts
git commit -m "feat(wu-npm): wire bin entry point"
```

---

## Task 21: README

**Files:**
- Create: `WU-npm/README.md`

**Interfaces:** 无代码接口；双语文档，风格对齐仓库现有 README。

- [ ] **Step 1: 写 README**

`WU-npm/README.md`（要点）：
```markdown
# wu-cli

*English | [中文](#中文)*

## English
CLI to create Windows Update Shipping Labels via the Microsoft Hardware Dev Center API. TypeScript rewrite of WU-Go.

### Install
    npm install -g wu-cli
    # or
    npx wu-cli

### Config & credentials
- Business defaults live in `~/.wu/config.json` (created on first run with built-in defaults).
- Credentials are stored encrypted (AES-256-GCM, machine-bound) in `~/.wu/credential.enc`.
- Precedence: CLI flags > config file.

### Usage
    wu
    wu --dry-run --chids 12345678-1234-1234-1234-123456789abc --publish-to-windows10s

### Options
（列出与 Go 版一致的全部 flag：--select-all --dry-run --schedule-go-live --go-live-date
 --auto-install-os-upgrade/--no-... --auto-install-applicable/--no-... --is-disclosure-restricted
 --publish-to-windows10s --is-reboot-required --is-co-engineered --is-for-unreleased-hardware
 --has-ui-software --visible-to-accounts --affected-oems --ms-contact --validations-performed
 --business-justification --name --destination --out --chids --no-ui --no-filter
 --tenant-id --client-id --client-secret --product-id --submission-id）

## 中文
（对应中文说明，镜像上文结构）
```

- [ ] **Step 2: Commit**

```bash
git add WU-npm/README.md
git commit -m "docs(wu-npm): add bilingual README"
```

---

## Self-Review

**1. Spec coverage：**
- §2 落位/技术栈 → Task 1。§3 目录结构 → 全任务。
- §4.1 位置 / §4.2 config 默认 → Task 6。§4.3 加密 → Task 7。§4.4 优先级 → Task 11。凭据加密存储 → Task 8。
- §5 UI 映射 → Task 17。§5.1 自定义多选热键/legend/配色/分页 → Task 15（状态）+ Task 18（渲染+热键）。`--no-ui` → Task 16。
- §6 逻辑保真：args→Task5，chid→Task4，shortcut→Task3，parse→Task9，listItems→Task10，payload→Task12。
- §7 编排 → Task 19；index → Task 20。§8 网络层 → Task 13/14。§9 测试 → 各任务 TDD。§10 交付 → Task 20/21。§11 差异 → 由 Task 6/8/11 落实。
- 覆盖完整，无遗漏。

**2. Placeholder scan：** Task 17 Step 1 曾含 `pc.rgb ? title : title` 占位，已由 Step 2 明确改为 `pc.yellow(title)`。其余步骤均为可执行代码，无 TBD/TODO。

**3. Type consistency：**
- `CLIOptions`（Task 11）字段被 Task 12/19 一致引用（camelCase）。
- `HardwareTarget`/`BundleUIMapping`/`Color`（Task 9）被 Task 10/12/18/19 一致引用。
- `Legend`（Task 18）与 `drivermeta` `BundleLegend`（Task 9）字段对齐，Task 19 做显式映射。
- `ListItem`（Task 10）被 Task 18/19 引用一致。
- `SelectState` 相关函数签名（Task 15）与 Task 18 调用一致。
- `EncBlob`/`encrypt`/`decrypt`（Task 7）与 Task 8 一致。

无签名/命名冲突。
