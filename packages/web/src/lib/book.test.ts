import { describe, expect, it } from 'vitest'
import {
  bookState,
  depthWithin,
  imbalance,
  largest,
  levelsOf,
  parseInstrument,
  sizeOf,
  stepAt,
  STALE_MS,
  summarize,
  visibleLevels,
  type Instrument,
} from './book'

const swap: Instrument = { id: 'BTC-USDT-SWAP', tickSz: 0.1, unit: 0.01, inverse: false }
const book = (rows: [string, string][]) => new Map(rows)

describe('parseInstrument', () => {
  const ok = (data: object) => ({ code: '0', data: [{ instId: 'X', tickSz: '0.1', ...data }] })

  it('reads a linear swap: contract value times multiplier per contract', () => {
    const i = parseInstrument(
      ok({ instId: 'BTC-USDT-SWAP', instType: 'SWAP', ctVal: '0.01', ctMult: '2', ctType: 'linear' }),
    )
    expect(i).toEqual({ id: 'BTC-USDT-SWAP', tickSz: 0.1, unit: 0.02, inverse: false })
  })

  it('reads spot as one coin per unit, with no contract fields', () => {
    expect(parseInstrument(ok({ instId: 'BTC-USDT', instType: 'SPOT', ctVal: '' })).unit).toBe(1)
  })

  it('flags inverse contracts', () => {
    expect(parseInstrument(ok({ instType: 'SWAP', ctVal: '100', ctType: 'inverse' })).inverse).toBe(true)
  })

  it('throws on an error code, an unknown instrument and unusable numbers', () => {
    expect(() => parseInstrument({ code: '51001', msg: 'Instrument ID does not exist', data: [] })).toThrow(
      'Instrument ID does not exist',
    )
    expect(() => parseInstrument({ code: '0', data: [] })).toThrow('does not list')
    expect(() => parseInstrument(ok({ instType: 'SWAP', ctVal: '0' }))).toThrow('contract value')
    expect(() => parseInstrument(ok({ instType: 'SWAP', ctVal: '0.01', tickSz: 'x' }))).toThrow()
    expect(() => parseInstrument(null)).toThrow()
  })
})

describe('sizeOf', () => {
  it('sizes a linear swap in base coin and quote notional', () => {
    expect(sizeOf(150, 80_000, swap)).toEqual({ base: 1.5, notional: 120_000 })
  })

  it('treats an inverse contract size as quote notional already', () => {
    const inverse: Instrument = { id: 'BTC-USD-SWAP', tickSz: 0.1, unit: 100, inverse: true }
    expect(sizeOf(3, 50_000, inverse)).toEqual({ base: 0.006, notional: 300 })
  })
})

describe('levelsOf', () => {
  const bids = book([
    ['100.0', '10'],
    ['100.3', '20'],
    ['100.9', '5'],
    ['101.2', '1'],
  ])

  it('buckets bids downwards, nearest first, summing size and notional', () => {
    const l = levelsOf(bids, 'bid', swap, 1)
    expect(l.map((x) => x.px)).toEqual([101, 100])
    // 100.0 + 100.3 + 100.9 land in the 100 bucket: 35 contracts
    expect(l[1].base).toBeCloseTo(0.35)
    expect(l[1].notional).toBeCloseTo(10 * 0.01 * 100 + 20 * 0.01 * 100.3 + 5 * 0.01 * 100.9)
  })

  it('buckets asks upwards so an order is never reported nearer the market than it is', () => {
    const asks = book([
      ['100.1', '1'],
      ['100.9', '1'],
      ['101.0', '1'],
    ])
    // 100.1 rounds up to 101, 100.9 to 101, 101.0 stays 101: all one bucket, never reported nearer than 101
    const l = levelsOf(asks, 'ask', swap, 1)
    expect(l.map((x) => x.px)).toEqual([101])
    expect(l[0].base).toBeCloseTo(0.03)
  })

  it('skips zero, negative and unreadable sizes', () => {
    expect(
      levelsOf(
        book([
          ['100', '0'],
          ['101', 'x'],
          ['102', '-1'],
        ]),
        'bid',
        swap,
        1,
      ),
    ).toEqual([])
  })
})

describe('depth and imbalance', () => {
  const bids = book([
    ['99.5', '100'],
    ['98', '100'],
    ['90', '1000'],
  ])
  const asks = book([
    ['100.5', '300'],
    ['103', '100'],
  ])

  it('sums the same band either side of the reference', () => {
    const bid = depthWithin(bids, 'bid', swap, 100, 0.02) // 98..100
    const ask = depthWithin(asks, 'ask', swap, 100, 0.02) // 100..102
    expect(bid.levels).toBe(2)
    expect(bid.base).toBeCloseTo(2)
    expect(ask.levels).toBe(1)
    expect(ask.base).toBeCloseTo(3)
  })

  it('computes imbalance in [-1, 1] and null when both sides are empty', () => {
    expect(imbalance(3, 1)).toBe(0.5)
    expect(imbalance(0, 5)).toBe(-1)
    expect(imbalance(2, 2)).toBe(0)
    expect(imbalance(0, 0)).toBeNull()
  })

  it('ranks the largest levels by the chosen metric', () => {
    const l = levelsOf(bids, 'bid', swap, 0.1)
    expect(largest(l, 'base', 1)[0].px).toBe(90)
    expect(largest(l, 'notional', 2).map((x) => x.px)).toEqual([90, 99.5])
  })
})

describe('stepAt', () => {
  it('never goes finer than the instrument tick', () => {
    expect(stepAt(80_000, 0, { ...swap, tickSz: 5 })).toBe(5)
    expect(stepAt(80_000, 1, swap)).toBeCloseTo(1)
  })
})

describe('visibleLevels', () => {
  const bids = book([
    ['99', '1000'],
    ['98', '100'],
    ['97', '10'],
    ['80', '5000'],
  ])
  const asks = book([
    ['101', '400'],
    ['102', '40'],
  ])
  const o = { sides: 'both', range: 0.05, minShare: 0, maxLevels: 10, group: 5 } as const
  const unit = { ...swap, tickSz: 1, unit: 1 }

  it('keeps only levels in range, measured from the middle of the touch', () => {
    const v = visibleLevels(bids, asks, unit, o)!
    expect(v.mid).toBe(100)
    expect(v.levels.map((l) => l.px).sort((a, b) => a - b)).toEqual([97, 98, 99, 101, 102])
  })

  it('hides levels under the threshold share of the biggest, and limits levels per side', () => {
    const v = visibleLevels(bids, asks, unit, { ...o, minShare: 0.25 })!
    expect(v.levels.every((l) => l.notional >= 0.25 * Math.max(...v.levels.map((x) => x.notional)))).toBe(true)
    expect(
      visibleLevels(bids, asks, unit, { ...o, maxLevels: 1 })!
        .levels.map((l) => l.px)
        .sort((a, b) => a - b),
    ).toEqual([99, 101])
  })

  it('filters sides', () => {
    expect(visibleLevels(bids, asks, unit, { ...o, sides: 'bids' })!.levels.every((l) => l.side === 'bid')).toBe(true)
    expect(visibleLevels(bids, asks, unit, { ...o, sides: 'asks' })!.levels.every((l) => l.side === 'ask')).toBe(true)
  })

  it('has nothing to measure from while a side is empty', () => {
    expect(visibleLevels(new Map(), asks, unit, o)).toBeNull()
  })
})

describe('summarize', () => {
  const bids = book([['99', '100']])
  const asks = book([['101', '300']])
  const unit = { ...swap, tickSz: 1, unit: 1 }
  const o = { ref: null, range: 0.05, metric: 'base', group: 0, top: 5 } as const

  it('falls back to the middle of the touch when there is no market price', () => {
    const s = summarize(bids, asks, unit, o)!
    expect(s.ref).toBe(100)
    expect(s.imbalance).toBeCloseTo((100 - 300) / 400)
  })

  it('measures distance from the market price, not the midpoint', () => {
    const s = summarize(bids, asks, unit, { ...o, ref: 99.5 })!
    expect(s.ref).toBe(99.5)
    expect(s.bids[0].abs).toBeCloseTo(-0.5)
    expect(s.asks[0].pct).toBeCloseTo(1.5 / 99.5)
  })

  it('is zero depth, not unavailable, when nothing rests in range', () => {
    const s = summarize(bids, asks, unit, { ...o, ref: 100, range: 0.001 })!
    expect(s.bid.base + s.ask.base).toBe(0)
    expect(s.imbalance).toBeNull()
    expect(s.bids).toEqual([])
  })

  it('is null while a side is empty', () => {
    expect(summarize(new Map(), asks, unit, o)).toBeNull()
  })
})

describe('bookState', () => {
  const live = { status: 'live', since: 1000 } as const
  const fresh = { seq: 5, at: 2000 }

  it('is live only on an open connection with a recent book', () => {
    expect(bookState(fresh, live, 2000 + STALE_MS)).toBe('live')
  })

  it('never calls an old book current', () => {
    expect(bookState(fresh, live, 2000 + STALE_MS + 1)).toBe('stale')
    expect(bookState(fresh, { status: 'retrying', since: 1000 }, 2100)).toBe('disconnected')
    expect(bookState(fresh, { status: 'idle', since: 1000 }, 2100)).toBe('disconnected')
  })

  it('waits for a new snapshot after a reconnect', () => {
    expect(bookState({ seq: 5, at: 900 }, live, 2000)).toBe('loading')
  })

  it('is loading before the first snapshot, and disconnected if the feed is already retrying', () => {
    expect(bookState({ seq: -1, at: 0 }, { status: 'connecting', since: 0 }, 5)).toBe('loading')
    expect(bookState({ seq: -1, at: 0 }, { status: 'retrying', since: 0 }, 5)).toBe('disconnected')
  })
})
