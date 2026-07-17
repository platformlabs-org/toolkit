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
  let viewH = termHeight - 6
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
