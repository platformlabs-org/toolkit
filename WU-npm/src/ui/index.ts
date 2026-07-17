import * as p from '@clack/prompts'
import pc from 'picocolors'
import { CanceledError } from '../support/errors.js'

const gray = pc.gray
const line = '────────────────────────────────────────────────'

// Color palette: indices match drivermeta/types COLORS order
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
  console.log(`${gray('╭')} ${pc.yellow(title)} ${gray(`Step ${current} of ${total}`)}`)
  console.log(gray('│'))
}

export function item(label: string, value?: string): void {
  console.log(`${gray('├')} ${label}`)
  if (value !== undefined) console.log(`${gray('│')} ${value}`)
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
