// Chart drawings, stored in time (ms) and price so they survive panning, zooming and interval changes.

export type Point = { time: number; price: number }

export type Drawing =
  | { id: string; kind: 'trend'; a: Point; b: Point }
  | { id: string; kind: 'rect'; a: Point; b: Point }
  /** `a` is level 1, `b` is level 0, as drawn from the swing start to its end. */
  | { id: string; kind: 'fib'; a: Point; b: Point }
  | { id: string; kind: 'position'; side: 'long' | 'short'; entry: Point; stop: number; target: number; end: number }
  | { id: string; kind: 'path'; points: Point[] }

export type Kind = Drawing['kind']
export type Tool = 'cursor' | 'trend' | 'rect' | 'fib' | 'long' | 'short' | 'path'

export const FIB_LEVELS = [1, 0.786, 0.618, 0.5, 0, -0.2] as const

export const fibPrice = (d: Extract<Drawing, { kind: 'fib' }>, level: number) =>
  d.b.price + (d.a.price - d.b.price) * level

/** Reward-to-risk of a position drawing, plus each leg as % of entry. */
export function positionStats(d: Extract<Drawing, { kind: 'position' }>) {
  const risk = Math.abs(d.entry.price - d.stop)
  const reward = Math.abs(d.target - d.entry.price)
  return {
    rr: risk ? reward / risk : 0,
    targetPct: ((d.target - d.entry.price) / d.entry.price) * 100,
    stopPct: ((d.stop - d.entry.price) / d.entry.price) * 100,
  }
}

let seq = 0
export const newId = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`
