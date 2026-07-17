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
