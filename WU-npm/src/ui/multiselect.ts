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

  // Clear screen and redraw
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
