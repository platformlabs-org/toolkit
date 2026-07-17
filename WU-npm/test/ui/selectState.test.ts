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
