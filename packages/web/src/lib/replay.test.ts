import { describe, expect, it } from 'vitest'
import type { Candle } from '@crypz/exchanges'
import { initialReplay, limitError, limitFill, replayReducer, type ReplayAction, type ReplayState } from './replay'

const bar = (time: number, open: number, high: number, low: number, close: number): Candle => ({
  time,
  open,
  high,
  low,
  close,
})
const order: Extract<ReplayAction, { type: 'order' }> = {
  type: 'order',
  side: 'long',
  price: 95,
  stop: null,
  target: null,
  leverage: 10,
}
const placed = (o = order): ReplayState => replayReducer(initialReplay(0), { ...o })
const step = (s: ReplayState, k: Candle) => replayReducer(s, { type: 'step', candle: k, closesAt: k.time + 60 })

describe('limit orders', () => {
  it('rests without a position until a bar reaches the price', () => {
    const s = step(placed(), bar(60, 100, 101, 96, 98))
    expect(s.position).toBeNull()
    expect(s.pending?.price).toBe(95)
  })

  it('fills a buy at its price when a bar trades down to it', () => {
    const s = step(placed(), bar(60, 100, 101, 94, 98))
    expect(s.pending).toBeNull()
    expect(s.position).toMatchObject({ side: 'long', entry: 95, entryTime: 60, leverage: 10 })
    expect(s.position?.liq).toBeCloseTo(85.5)
  })

  it('fills a sell at its price when a bar trades up to it', () => {
    const s = step(placed({ ...order, side: 'short', price: 105 }), bar(60, 100, 106, 99, 101))
    expect(s.position).toMatchObject({ side: 'short', entry: 105 })
  })

  it('fills at the open when the bar gaps through the price', () => {
    expect(limitFill({ side: 'long', price: 95 }, bar(60, 90, 92, 88, 91))).toBe(90)
    expect(limitFill({ side: 'short', price: 105 }, bar(60, 110, 112, 108, 109))).toBe(110)
  })

  it('does not test the filling bar against the new stop and target', () => {
    const s = step(placed({ ...order, stop: 90 }), bar(60, 100, 101, 85, 98))
    expect(s.position?.entry).toBe(95)
    expect(s.trades).toHaveLength(0)
  })

  it('then trades like any position on later bars', () => {
    const filled = step(placed({ ...order, stop: 90 }), bar(60, 100, 101, 94, 98))
    const out = step(filled, bar(120, 98, 99, 89, 90))
    expect(out.position).toBeNull()
    expect(out.trades[0]).toMatchObject({ entry: 95, exit: 90, reason: 'stop' })
  })

  it('moves, keeps its levels in step, and cancels', () => {
    let s = replayReducer(placed(), { type: 'move', price: 92 })
    expect(s.pending?.price).toBe(92)
    s = replayReducer(s, { type: 'levels', stop: 80, target: 120 })
    expect(s.pending).toMatchObject({ stop: 80, target: 120 })
    expect(replayReducer(s, { type: 'cancel' }).pending).toBeNull()
  })

  it('allows one order, and none beside a position', () => {
    const s = placed()
    expect(replayReducer(s, { ...order, price: 90 })).toBe(s)
    const open = replayReducer(initialReplay(0), {
      type: 'open',
      side: 'long',
      candle: bar(0, 1, 1, 1, 100),
      stop: null,
      target: null,
      leverage: 10,
    })
    expect(replayReducer(open, order)).toBe(open)
  })

  it('a market order replaces a waiting one', () => {
    const s = replayReducer(placed(), {
      type: 'open',
      side: 'long',
      candle: bar(0, 1, 1, 1, 100),
      stop: null,
      target: null,
      leverage: 10,
    })
    expect(s.pending).toBeNull()
    expect(s.position?.entry).toBe(100)
  })

  it('keeps a buy below the price and a sell above it', () => {
    expect(limitError('long', 100, 95, null, null)).toBeNull()
    expect(limitError('long', 100, 105, null, null)).toMatch(/below/)
    expect(limitError('short', 100, 95, null, null)).toMatch(/above/)
    expect(limitError('long', 100, 95, 96, null)).toMatch(/Stop/)
  })
})
