import { FIB_LEVELS, fibPrice, type Drawing, type Point } from './model'

// Pure screen geometry for drawings: where the handles are, what the pointer is over, and how a drag reshapes one.

/** Chart coordinate conversion, in pane CSS pixels. Null when the chart cannot place the value. */
export type Mapper = {
  x: (time: number) => number | null
  y: (price: number) => number | null
  point: (x: number, y: number) => Point | null
}

export type Handle = { key: string; x: number; y: number; cursor: string }
export type Hit = { part: string; cursor: string }

const HIT_PX = 6

const shift = (p: Point, dt: number, dp: number): Point => ({ time: p.time + dt, price: p.price + dp })

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

type Box = { t1: number; t2: number; hi: number; lo: number }
const box = (a: Point, b: Point): Box => ({
  t1: Math.min(a.time, b.time),
  t2: Math.max(a.time, b.time),
  hi: Math.max(a.price, b.price),
  lo: Math.min(a.price, b.price),
})

const RECT_HANDLES: [key: string, cursor: string][] = [
  ['tl', 'nwse-resize'],
  ['t', 'ns-resize'],
  ['tr', 'nesw-resize'],
  ['r', 'ew-resize'],
  ['br', 'nwse-resize'],
  ['b', 'ns-resize'],
  ['bl', 'nesw-resize'],
  ['l', 'ew-resize'],
]

/** Grab points shown on a selected drawing. */
export function handles(d: Drawing, m: Mapper): Handle[] {
  const at = (key: string, time: number, price: number, cursor = 'move'): Handle | null => {
    const x = m.x(time)
    const y = m.y(price)
    return x === null || y === null ? null : { key, x, y, cursor }
  }
  let out: (Handle | null)[] = []
  switch (d.kind) {
    case 'trend':
    case 'fib':
      out = [at('a', d.a.time, d.a.price), at('b', d.b.time, d.b.price)]
      break
    case 'rect': {
      const r = box(d.a, d.b)
      const mt = (r.t1 + r.t2) / 2
      const mp = (r.hi + r.lo) / 2
      const pos: Record<string, [number, number]> = {
        tl: [r.t1, r.hi],
        t: [mt, r.hi],
        tr: [r.t2, r.hi],
        r: [r.t2, mp],
        br: [r.t2, r.lo],
        b: [mt, r.lo],
        bl: [r.t1, r.lo],
        l: [r.t1, mp],
      }
      out = RECT_HANDLES.map(([k, c]) => at(k, pos[k][0], pos[k][1], c))
      break
    }
    case 'position':
      out = [
        at('entry', d.entry.time, d.entry.price),
        at('target', d.entry.time, d.target, 'ns-resize'),
        at('stop', d.entry.time, d.stop, 'ns-resize'),
        at('end', d.end, d.entry.price, 'ew-resize'),
      ]
      break
    case 'path':
      out = d.points.map((p, i) => at(String(i), p.time, p.price))
      break
  }
  return out.filter((h): h is Handle => h !== null)
}

/** What part of a drawing sits under the pointer: a handle (when selected) or its body. */
export function hitTest(d: Drawing, m: Mapper, px: number, py: number, selected: boolean): Hit | null {
  if (selected)
    for (const h of handles(d, m))
      if (Math.abs(px - h.x) <= HIT_PX && Math.abs(py - h.y) <= HIT_PX) return { part: h.key, cursor: h.cursor }
  const near = (a: Point, b: Point) => {
    const ax = m.x(a.time)
    const ay = m.y(a.price)
    const bx = m.x(b.time)
    const by = m.y(b.price)
    return ax !== null && ay !== null && bx !== null && by !== null && distToSegment(px, py, ax, ay, bx, by) <= HIT_PX
  }
  const inside = (t1: number, t2: number, p1: number, p2: number) => {
    const x1 = m.x(t1)
    const x2 = m.x(t2)
    const y1 = m.y(p1)
    const y2 = m.y(p2)
    if (x1 === null || x2 === null || y1 === null || y2 === null) return false
    return (
      px >= Math.min(x1, x2) - HIT_PX &&
      px <= Math.max(x1, x2) + HIT_PX &&
      py >= Math.min(y1, y2) - HIT_PX &&
      py <= Math.max(y1, y2) + HIT_PX
    )
  }
  const body: Hit = { part: 'body', cursor: 'move' }
  switch (d.kind) {
    case 'trend':
      return near(d.a, d.b) ? body : null
    case 'rect':
      return inside(d.a.time, d.b.time, d.a.price, d.b.price) ? body : null
    case 'fib': {
      const t1 = Math.min(d.a.time, d.b.time)
      const t2 = Math.max(d.a.time, d.b.time)
      const onLevel = FIB_LEVELS.some((l) => {
        const p = fibPrice(d, l)
        return near({ time: t1, price: p }, { time: t2, price: p })
      })
      return onLevel || near(d.a, d.b) ? body : null
    }
    case 'position':
      return inside(d.entry.time, d.end, d.stop, d.target) ? body : null
    case 'path':
      return d.points.some((p, i) => i > 0 && near(d.points[i - 1], p)) ? body : null
  }
}

/** Reshape `d0` (the drawing as it was on pointer-down) for a drag from `p0` to `p`. */
export function drag(d0: Drawing, part: string, p0: Point, p: Point): Drawing {
  const dt = p.time - p0.time
  const dp = p.price - p0.price
  switch (d0.kind) {
    case 'trend':
    case 'fib':
      if (part === 'a') return { ...d0, a: p }
      if (part === 'b') return { ...d0, b: p }
      return { ...d0, a: shift(d0.a, dt, dp), b: shift(d0.b, dt, dp) }
    case 'rect': {
      if (part === 'body') return { ...d0, a: shift(d0.a, dt, dp), b: shift(d0.b, dt, dp) }
      const r = box(d0.a, d0.b)
      if (part.startsWith('t')) r.hi = p.price
      if (part.startsWith('b')) r.lo = p.price
      if (part.endsWith('l')) r.t1 = p.time
      if (part.endsWith('r')) r.t2 = p.time
      return { ...d0, a: { time: r.t1, price: r.hi }, b: { time: r.t2, price: r.lo } }
    }
    case 'position': {
      // keep target and stop on their own side of entry, so the zones never swap meaning
      const up = d0.side === 'long' ? 1 : -1
      const lo = Math.min(d0.stop, d0.target)
      const hi = Math.max(d0.stop, d0.target)
      const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)
      switch (part) {
        case 'entry':
          return { ...d0, entry: { time: Math.min(p.time, d0.end), price: clamp(p.price, lo, hi) } }
        case 'target':
          return { ...d0, target: up * (p.price - d0.entry.price) > 0 ? p.price : d0.entry.price }
        case 'stop':
          return { ...d0, stop: up * (d0.entry.price - p.price) > 0 ? p.price : d0.entry.price }
        case 'end':
          return { ...d0, end: Math.max(p.time, d0.entry.time) }
        default:
          return {
            ...d0,
            entry: shift(d0.entry, dt, dp),
            stop: d0.stop + dp,
            target: d0.target + dp,
            end: d0.end + dt,
          }
      }
    }
    case 'path': {
      if (part === 'body') return { ...d0, points: d0.points.map((q) => shift(q, dt, dp)) }
      const i = Number(part)
      return { ...d0, points: d0.points.map((q, j) => (j === i ? p : q)) }
    }
  }
}
