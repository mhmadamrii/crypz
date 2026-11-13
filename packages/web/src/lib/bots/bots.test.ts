import { describe, expect, it } from 'vitest'
import { BAR_MS, type Candle } from '@crypz/exchanges'
import { prepareCandles } from './data'
import { exitOn, runBacktest } from './engine'
import { fetchRange } from './fetch'
import { defaultForm, parseForm } from './form'
import { atr, emaOf, rsi, smaOf } from './indicators'
import { computeMetrics, drawdownCurve, tradesCsv } from './metrics'
import { floorLot, levels, sizePosition, snap } from './sizing'
import { computeSeries, rawStop, signalAt, trendIndexAt, trendOf, type Series } from './strategy'
import { DEFAULT_CONFIG, type BotConfig, type BotTrade, type Spec } from './types'

const M5 = BAR_MS['5m']
const M15 = BAR_MS['15m']
const k = (time: number, open: number, high: number, low: number, close: number, volume = 100): Candle => ({
  time,
  open,
  high,
  low,
  close,
  volume,
})
const spec: Spec = { ctVal: 0.01, lotSz: 1, minSz: 1, tickSz: 0.1 }

describe('indicators', () => {
  it('ema is seeded with the simple average', () => {
    const e = emaOf([1, 2, 3, 4, 5], 3)
    expect(e.slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(e[2]).toBeCloseTo(2)
    expect(e[3]).toBeCloseTo(3) // 4 * 0.5 + 2 * 0.5
    expect(e[4]).toBeCloseTo(4)
  })

  it('sma of volume', () => {
    const s = smaOf([2, 4, 6, 8], 2)
    expect(s[0]).toBeNaN()
    expect(s.slice(1)).toEqual([3, 5, 7])
  })

  it('rsi: Wilder smoothing, 100 with no losses, 0 with no gains', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100)
    expect(rsi([6, 5, 4, 3, 2, 1], 3)[5]).toBeCloseTo(0)
    // one up move of 2 then one down move of 1 over a period of 2: gain 1, loss 0.5 -> RS 2 -> 66.67
    expect(rsi([10, 12, 11], 2)[2]).toBeCloseTo(66.667, 2)
    expect(rsi([10, 12, 11], 2)[1]).toBeNaN()
  })

  it('atr of equal ranges is that range', () => {
    const c = Array.from({ length: 20 }, (_, i) => k(i, 10, 12, 10, 11))
    const a = atr(c, 14)
    expect(a[13]).toBeNaN()
    expect(a[14]).toBeCloseTo(2) // first bar has no previous close, later true ranges are 2
    expect(a[19]).toBeCloseTo(2)
  })
})

/** A hand-built series where every indicator is set, so the rules can be read one at a time. */
function series(over: Partial<Series> & { candles: Candle[] }): Series {
  const n = over.candles.length
  const fill = (v: number) => new Array<number>(n).fill(v)
  return {
    emaFast: fill(100),
    emaMid: fill(98),
    emaSlow: fill(90),
    rsi: fill(55),
    atr: fill(2),
    volSma: fill(50),
    ...over,
  }
}
const cfg = { rsiTrigger: 50, pullbackAtr: 1, swingLookback: 5, slAtrBuffer: 0.1 }

describe('trend filter', () => {
  const t = (f: number, m: number, l: number, close: number) =>
    trendOf(
      series({
        candles: [k(0, close, close, close, close)],
        emaFast: [f],
        emaMid: [m],
        emaSlow: [l],
      }),
      0,
    )
  it('long needs stacked EMAs and a close above the slow one', () => {
    expect(t(110, 105, 100, 120)).toBe('long')
    expect(t(110, 105, 100, 99)).toBeNull()
    expect(t(105, 110, 100, 120)).toBeNull()
  })
  it('short is the mirror image', () => {
    expect(t(90, 95, 100, 80)).toBe('short')
    expect(t(90, 95, 100, 101)).toBeNull()
  })
  it('is off while the slow ema warms up', () => {
    expect(t(110, 105, Number.NaN, 120)).toBeNull()
  })
})

describe('entry signal', () => {
  // candle 1 is the signal candle: it dips to the fast EMA (100), closes up, on volume above the average
  const long = (o: { low?: number; close?: number; vol?: number; prev?: number; now?: number } = {}) =>
    series({
      candles: [k(0, 101, 102, 100, 101), k(M5, 100.5, 103, o.low ?? 99.5, o.close ?? 102, o.vol ?? 80)],
      rsi: [o.prev ?? 48, o.now ?? 52],
    })
  it('long: pullback, RSI crossing up through 50, bullish, volume', () => {
    expect(signalAt(long(), 1, 'long', cfg)).toBe('long')
  })
  it('needs the RSI to cross on this candle, not just sit above 50', () => {
    expect(signalAt(long({ prev: 55, now: 60 }), 1, 'long', cfg)).toBeNull()
    expect(signalAt(long({ prev: 50, now: 50.01 }), 1, 'long', cfg)).toBe('long')
    expect(signalAt(long({ prev: 49, now: 50 }), 1, 'long', cfg)).toBeNull()
  })
  it('needs a pullback to the EMA area, and not one far below the mid EMA', () => {
    expect(signalAt(long({ low: 100.5 }), 1, 'long', cfg)).toBeNull()
    expect(signalAt(long({ low: 95.5 }), 1, 'long', cfg)).toBeNull() // 98 - 1 ATR(2) = 96
    expect(signalAt(long({ low: 96.5 }), 1, 'long', cfg)).toBe('long')
  })
  it('needs a bullish candle on above-average volume', () => {
    expect(signalAt(long({ close: 100 }), 1, 'long', cfg)).toBeNull()
    expect(signalAt(long({ vol: 50 }), 1, 'long', cfg)).toBeNull()
  })
  it('short mirrors it', () => {
    const s = series({
      candles: [k(0, 99, 100, 98, 99), k(M5, 99.5, 100.5, 96, 97, 80)],
      emaFast: [100, 100],
      emaMid: [102, 102],
      rsi: [52, 48],
    })
    expect(signalAt(s, 1, 'short', cfg)).toBe('short')
    expect(signalAt(s, 1, 'long', cfg)).toBeNull()
    expect(signalAt(s, 1, null, cfg)).toBeNull()
  })
  it('stays quiet until every indicator exists', () => {
    expect(signalAt(long({ now: Number.NaN }), 1, 'long', cfg)).toBeNull()
    expect(signalAt(long(), 0, 'long', cfg)).toBeNull()
  })
})

describe('timeframe mapping', () => {
  const trend = [k(0, 1, 1, 1, 1), k(M15, 1, 1, 1, 1), k(2 * M15, 1, 1, 1, 1)]
  it('uses only trend candles that have closed when the 5m candle closes', () => {
    // 5m candle at 10:10 closes at 10:15, exactly when the 15m candle at 10:00 closes
    expect(trendIndexAt(trend, M15, M15, 0)).toBe(0) // 15m #0 closed at M15
    expect(trendIndexAt(trend, M15, M15 - M5, 0)).toBe(-1) // still forming
    expect(trendIndexAt(trend, M15, M15 + M5, 0)).toBe(0) // #1 is forming
    expect(trendIndexAt(trend, M15, 2 * M15, 0)).toBe(1)
  })
})

describe('stop, target and sizing', () => {
  const s = series({
    candles: [k(0, 10, 11, 9, 10), k(1, 10, 12, 8, 11), k(2, 11, 13, 10, 12)],
    atr: [1, 1, 1],
  })
  it('stop is the swing extreme beyond the ATR buffer', () => {
    expect(rawStop(s, 2, 'long', { swingLookback: 3, slAtrBuffer: 0.1 })).toBeCloseTo(7.9)
    expect(rawStop(s, 2, 'long', { swingLookback: 1, slAtrBuffer: 0.1 })).toBeCloseTo(9.9)
    expect(rawStop(s, 2, 'short', { swingLookback: 3, slAtrBuffer: 0.1 })).toBeCloseTo(13.1)
  })
  it('target is rr times the stop distance on the profit side', () => {
    expect(levels('long', 100, 98, 3, 0.1)).toEqual({ stop: 98, target: 106 })
    expect(levels('short', 100, 102, 2.5, 0.1)).toEqual({ stop: 102, target: 95 })
  })
  it('rounds the stop away and the target in, to the price step', () => {
    expect(levels('long', 100, 97.93, 3, 0.1).stop).toBe(97.9)
    expect(levels('short', 100, 102.07, 3, 0.1).stop).toBe(102.1)
    expect(snap(100.04, 0.1, 'up')).toBe(100.1)
    expect(snap(0.3, 0.1, 'down')).toBe(0.3)
  })
  it('risks 1% of equity before costs', () => {
    const z = sizePosition({
      equity: 1000,
      riskPct: 1,
      entry: 100,
      stop: 98,
      spec: { ...spec, ctVal: 0.001, lotSz: 0.01 },
      maxLeverage: 100,
    })
    if (!z.ok) throw new Error(z.reason)
    // 10 USDT budget over 2 USDT per coin = 5 coins = 5000 contracts of 0.001
    expect(z.contracts).toBe(5000)
    expect(z.qtyBase * 2).toBeCloseTo(10)
    expect(z.riskBudget).toBe(10)
  })
  it('floors to the lot size, so the risk never goes over', () => {
    const z = sizePosition({
      equity: 1000,
      riskPct: 1,
      entry: 100,
      stop: 97,
      spec: { ...spec, ctVal: 1, lotSz: 1 },
      maxLeverage: 100,
    })
    if (!z.ok) throw new Error(z.reason)
    expect(z.contracts).toBe(3) // 10 / 3 = 3.33
    expect(z.qtyBase * 3).toBeLessThanOrEqual(10)
    expect(floorLot(0.37, 0.1)).toBe(0.3)
  })
  it('skips under the minimum order size and over the leverage cap', () => {
    const small = sizePosition({
      equity: 10,
      riskPct: 1,
      entry: 100,
      stop: 90,
      spec: { ...spec, ctVal: 1, minSz: 1 },
      maxLeverage: 100,
    })
    expect(small).toMatchObject({ ok: false, reason: expect.stringMatching(/minimum/) })
    // 1% risk on a 0.1% stop is a 10x equity position
    const big = sizePosition({
      equity: 1000,
      riskPct: 1,
      entry: 100,
      stop: 99.9,
      spec: { ...spec, ctVal: 0.01 },
      maxLeverage: 5,
    })
    expect(big).toMatchObject({ ok: false, reason: expect.stringMatching(/leverage/) })
  })
})

describe('exits', () => {
  it('long: target, stop', () => {
    expect(exitOn('long', k(0, 100, 107, 99, 105), 95, 106)).toEqual({ ref: 106, reason: 'TP' })
    expect(exitOn('long', k(0, 100, 101, 94, 99), 95, 106)).toEqual({ ref: 95, reason: 'SL' })
    expect(exitOn('long', k(0, 100, 101, 96, 99), 95, 106)).toBeNull()
  })
  it('short: target, stop', () => {
    expect(exitOn('short', k(0, 100, 101, 93, 95), 105, 94)).toEqual({ ref: 94, reason: 'TP' })
    expect(exitOn('short', k(0, 100, 106, 99, 103), 105, 94)).toEqual({ ref: 105, reason: 'SL' })
  })
  it('a candle touching both counts as the stop', () => {
    expect(exitOn('long', k(0, 100, 110, 90, 100), 95, 106)).toEqual({ ref: 95, reason: 'SL' })
    expect(exitOn('short', k(0, 100, 110, 90, 100), 105, 94)).toEqual({ ref: 105, reason: 'SL' })
  })
  it('a gap past the stop fills at the open, the worse price', () => {
    expect(exitOn('long', k(0, 90, 92, 88, 91), 95, 106)).toEqual({ ref: 90, reason: 'SL' })
    expect(exitOn('short', k(0, 110, 112, 108, 109), 105, 94)).toEqual({ ref: 110, reason: 'SL' })
  })
  it('a gap past the target fills at the open', () => {
    expect(exitOn('long', k(0, 108, 110, 107, 109), 95, 106)).toEqual({ ref: 108, reason: 'TP' })
  })
})

// ---- the whole run, on a synthetic series ----------------------------------------------------------------------

/** Seeded random walk with drift in 5m candles, and the 15m candles built from them. */
function market(n: number, drift = 0.0004, seed = 7) {
  let x = seed
  const rand = () => {
    x = (x * 1664525 + 1013904223) % 4294967296
    return x / 4294967296
  }
  const five: Candle[] = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const open = price
    const close = open * (1 + drift + (rand() - 0.5) * 0.006)
    const high = Math.max(open, close) * (1 + rand() * 0.002)
    const low = Math.min(open, close) * (1 - rand() * 0.002)
    five.push(k(i * M5, open, high, low, close, 50 + rand() * 100))
    price = close
  }
  const fifteen: Candle[] = []
  for (let i = 0; i + 2 < five.length; i += 3) {
    const g = five.slice(i, i + 3)
    fifteen.push(
      k(
        g[0].time,
        g[0].open,
        Math.max(...g.map((c) => c.high)),
        Math.min(...g.map((c) => c.low)),
        g[2].close,
        g.reduce((s, c) => s + c.volume!, 0),
      ),
    )
  }
  return { five, fifteen }
}

// short periods so a few thousand synthetic candles exercise the whole pipeline
const small: BotConfig = {
  ...DEFAULT_CONFIG,
  symbol: 'TEST-USDT-SWAP',
  emaFast: 5,
  emaMid: 10,
  emaSlow: 20,
  startMs: 0,
  endMs: 0,
  pullbackAtr: 3,
  minStopAtr: 0,
}
const spec2: Spec = { ctVal: 0.1, lotSz: 1, minSz: 1, tickSz: 0.01 }

describe('backtest engine', () => {
  const { five, fifteen } = market(3000)
  const config = { ...small, startMs: five[300].time, endMs: five[2999].time + M5 }
  const run = (c = config, f = five, t = fifteen) => {
    const r = runBacktest(c, spec2, f, t)
    if (!r.ok) throw new Error(r.errors.join(' '))
    return r.result
  }

  it('trades, and is repeatable', () => {
    const a = run()
    expect(a.trades.length).toBeGreaterThan(3)
    expect(run()).toEqual(a)
    expect(run(config, [...five].reverse(), [...fifteen].reverse()).trades).toEqual(a.trades)
  })

  it('enters at the open of the candle after the signal, never at the signal close', () => {
    const r = run()
    const byTime = new Map(five.map((c) => [c.time, c]))
    for (const t of r.trades) {
      expect(t.entryTime).toBe(t.signalTime) // the signal candle closed exactly when the next one opened
      const fill = byTime.get(t.entryTime)!
      expect(Math.abs(t.entry - fill.open)).toBeLessThanOrEqual(spec2.tickSz)
      expect(t.exitTime).toBeGreaterThanOrEqual(t.entryTime)
    }
  })

  it('keeps one position at a time and the stop on the loss side', () => {
    const r = run()
    r.trades.forEach((t, i) => {
      if (i) expect(t.entryTime).toBeGreaterThanOrEqual(r.trades[i - 1].exitTime)
      expect(t.side === 'long' ? t.stop < t.entry && t.target > t.entry : t.stop > t.entry && t.target < t.entry).toBe(
        true,
      )
      expect(Math.abs(t.target - t.entry) / Math.abs(t.entry - t.stop)).toBeGreaterThan(2.9)
    })
  })

  it('sizes each trade at no more than the risk budget and chains equity', () => {
    const r = run()
    r.trades.forEach((t, i) => {
      expect(t.riskBudget).toBeCloseTo(t.equityBefore * 0.01)
      expect(t.qtyBase * Math.abs(t.entry - t.stop)).toBeLessThanOrEqual(t.riskBudget + 1e-9)
      expect(t.netPnl).toBeCloseTo(t.grossPnl - t.fees)
      expect(t.equityAfter).toBeCloseTo(t.equityBefore + t.netPnl)
      if (i) expect(t.equityBefore).toBeCloseTo(r.trades[i - 1].equityAfter)
    })
  })

  it('fees and slippage make every trade worse', () => {
    const free = run({ ...config, feeRate: 0, slippageBps: 0 })
    const costly = run({ ...config, feeRate: 0.001, slippageBps: 5 })
    const first = costly.trades[0]
    const same = free.trades.find((t) => t.entryTime === first.entryTime)!
    expect(same).toBeDefined()
    expect(first.fees).toBeGreaterThan(0)
    expect(first.slippageCost).toBeGreaterThan(0)
    expect(free.trades[0].fees).toBe(0)
    const sum = (r: ReturnType<typeof run>) => r.equity.at(-1)!.equity
    expect(sum(costly)).toBeLessThan(sum(free))
  })

  it('closes a position still open at the end of the data', () => {
    // a target nothing reaches: every trade ends on its stop, or on the last candle
    const r = run({ ...config, rr: 1000, riskPct: 0.1 })
    const last = r.trades.at(-1)!
    expect(last.reason).toBe('end_of_data')
    expect(last.exitTime).toBe(r.coverage.lastTime)
    const final = five.find((c) => c.time === r.coverage.lastTime)!
    expect(last.exit).toBeCloseTo(final.close, 6)
    expect(r.trades.filter((t) => t.reason === 'end_of_data')).toHaveLength(1)
  })

  it('does not look ahead: later candles never change earlier trades', () => {
    const full = run()
    const cutAt = five[1500].time + M5
    const cut = run(
      { ...config, endMs: cutAt },
      five.slice(0, 1501),
      fifteen.filter((c) => c.time + M15 <= cutAt),
    )
    const done = cut.trades.filter((t) => t.reason !== 'end_of_data')
    expect(done.length).toBeGreaterThan(0)
    expect(full.trades.slice(0, done.length)).toEqual(done)
  })

  it('refuses bad input instead of repairing it', () => {
    const noVol = five.map((c) => ({ ...c, volume: undefined }))
    expect(runBacktest(config, spec2, noVol, fifteen)).toMatchObject({ ok: false })
    expect(runBacktest(config, spec2, [], fifteen)).toMatchObject({ ok: false })
    expect(runBacktest(config, spec2, five.slice(0, 20), fifteen)).toMatchObject({ ok: false })
    expect(runBacktest({ ...config, entryBar: '15m', trendBar: '5m' }, spec2, five, fifteen)).toMatchObject({
      ok: false,
    })
  })

  it('stops trading once equity is gone', () => {
    const r = run({ ...config, initialEquity: 1000, riskPct: 100, maxLeverage: 1000, feeRate: 0.01 })
    const dead = r.equity.findIndex((p) => p.equity <= 0)
    if (dead >= 0) expect(r.equity.length - 1).toBe(dead)
  })

  it('computes the series from the full history, not a visible window', () => {
    const s = computeSeries(five, small)
    const t = computeSeries(five.slice(0, 1500), small)
    expect(s.emaMid[1499]).toBeCloseTo(t.emaMid[1499], 10)
    expect(s.rsi[1499]).toBeCloseTo(t.rsi[1499], 10)
    expect(s.atr[1499]).toBeCloseTo(t.atr[1499], 10)
  })
})

describe('candle checks', () => {
  it('flags empty, duplicate, unsorted, invalid and missing', () => {
    expect(prepareCandles([], M5, '5m').errors).toHaveLength(1)
    const dup = prepareCandles([k(M5, 1, 2, 1, 2), k(0, 1, 2, 1, 2), k(M5, 1, 3, 1, 2)], M5, '5m')
    expect(dup.duplicates).toBe(1)
    expect(dup.unsorted).toBe(true)
    expect(dup.candles.map((c) => c.time)).toEqual([0, M5])
    expect(dup.candles[1].high).toBe(3) // the last duplicate wins
    expect(prepareCandles([k(0, 1, 0.5, 1, 1)], M5, '5m').errors[0]).toMatch(/invalid/)
    expect(prepareCandles([k(0, 1, 2, 1, 1, -1)], M5, '5m').errors[0]).toMatch(/volume/)
    expect(prepareCandles([k(0, 1, 2, 1, 1), k(3 * M5, 1, 2, 1, 1)], M5, '5m').missing).toBe(2)
  })
})

describe('metrics', () => {
  const trade = (id: number, net: number, r: number, before: number, extra: Partial<BotTrade> = {}): BotTrade => ({
    id,
    side: 'long',
    signalTime: id * 1000,
    entryTime: id * 1000,
    entry: 100,
    stop: 99,
    target: 103,
    exitTime: id * 1000 + 500,
    exit: 101,
    reason: net > 0 ? 'TP' : 'SL',
    contracts: 1,
    qtyBase: 1,
    notional: 100,
    riskBudget: before * 0.01,
    grossPnl: net + 0.2,
    fees: 0.2,
    slippageCost: 0.1,
    netPnl: net,
    r,
    equityBefore: before,
    equityAfter: before + net,
    ...extra,
  })
  const trades = [trade(1, -10, -1, 1000), trade(2, 30, 3, 990), trade(3, -10.2, -1, 1020), trade(4, -5, -0.5, 1009.8)]
  const equity = [{ time: 0, equity: 1000 }, ...trades.map((t) => ({ time: t.exitTime, equity: t.equityAfter }))]

  it('summarises closed trades after costs', () => {
    const m = computeMetrics(trades, equity, 1000, { from: 0, to: 10_000 })
    expect(m.finalEquity).toBeCloseTo(1004.8)
    expect(m.netPnl).toBeCloseTo(4.8)
    expect(m.netPct).toBeCloseTo(0.48)
    expect(m.winRate).toBe(0.25)
    expect(m.profitFactor).toBeCloseTo(30 / 25.2)
    expect(m.avgWin).toBe(30)
    expect(m.avgLoss).toBeCloseTo(-8.4)
    expect(m.expectancy).toBeCloseTo(1.2)
    expect(m.expectancyR).toBeCloseTo(0.125)
    expect(m.totalFees).toBeCloseTo(0.8)
    expect(m.exposure).toBeCloseTo(0.2)
  })

  it('max drawdown runs from a peak to the trough after it', () => {
    const m = computeMetrics(trades, equity, 1000, { from: 0, to: 10_000 })
    // peak 1020 -> trough 1004.8
    expect(m.maxDrawdown).toBeCloseTo(1020 - 1004.8)
    expect(m.maxDrawdownPct).toBeCloseTo(((1020 - 1004.8) / 1020) * 100, 4)
    expect(drawdownCurve(equity).map((p) => p.drawdown)[0]).toBe(0)
  })

  it('profit factor is infinite with no loss and n/a with no trades', () => {
    const w = [trade(1, 5, 0.5, 1000)]
    expect(
      computeMetrics(
        w,
        [
          { time: 0, equity: 1000 },
          { time: 1, equity: 1005 },
        ],
        1000,
        { from: 0, to: 10 },
      ).profitFactor,
    ).toBe(Infinity)
    const none = computeMetrics([], [{ time: 0, equity: 1000 }], 1000, { from: 0, to: 10 })
    expect(none).toMatchObject({ profitFactor: null, winRate: null, expectancy: null, netPnl: 0, maxDrawdown: 0 })
  })

  it('exports a csv row per trade', () => {
    const lines = tradesCsv(trades).split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[0]).toMatch(/^id,side,/)
  })
})

describe('fetching a range', () => {
  const bars = Array.from({ length: 1000 }, (_, i) => k(i * M5, 1, 1, 1, 1))
  const page = async (before: number) => bars.filter((c) => c.time < before).slice(-100)
  it('pages back to the start and keeps only closed candles inside the range', async () => {
    const from = 300 * M5
    const to = 700 * M5
    const got = await fetchRange(page, '5m', from, to, { now: 10_000 * M5 })
    expect(got[0].time).toBe(from)
    expect(got.at(-1)!.time).toBe(to - M5)
    expect(got).toHaveLength(400)
  })
  it('drops the forming candle', async () => {
    const got = await fetchRange(page, '5m', 900 * M5, 2000 * M5, { now: 950 * M5 + 1 })
    expect(got.at(-1)!.time).toBe(949 * M5)
  })
  it('throws instead of returning a short series when the range is too big', async () => {
    await expect(fetchRange(page, '5m', 0, 1000 * M5, { maxPages: 3, now: 10_000 * M5 })).rejects.toThrow(/Shorten/)
  })
})

describe('form', () => {
  const now = Date.parse('2026-06-15T12:00:00Z')
  it('starts on the spec defaults: 1000 USDT, 1%, 3.0, 5m over 15m', () => {
    const f = defaultForm('BTC-USDT-SWAP', now)
    expect(f).toMatchObject({ equity: '1000', riskPct: '1', rr: '3.0', entryBar: '5m', trendBar: '15m' })
    const p = parseForm(f, now)
    if (!p.ok) throw new Error(p.errors.join(' '))
    expect(p.config).toMatchObject({
      initialEquity: 1000,
      riskPct: 1,
      rr: 3,
      emaFast: 20,
      emaMid: 50,
      emaSlow: 200,
      swingLookback: 5,
      slAtrBuffer: 0.1,
    })
    expect(p.config.feeRate).toBeCloseTo(0.0005)
    expect(p.config.endMs - p.config.startMs).toBe(14 * 86_400_000) // the end day is included
  })
  it('rejects bad input with a reason for each', () => {
    const f = {
      ...defaultForm('BTC-USDT-SWAP', now),
      equity: '',
      riskPct: '0',
      start: '2026-01-01',
      emaMid: '10',
      emaFast: '20',
    }
    const p = parseForm(f, now)
    expect(p.ok).toBe(false)
    if (!p.ok) {
      expect(p.errors.join(' ')).toMatch(/Initial equity/)
      expect(p.errors.join(' ')).toMatch(/Risk per trade/)
      expect(p.errors.join(' ')).toMatch(/at most 31 days/)
    }
    expect(parseForm({ ...defaultForm('X', now), trendBar: '5m' }, now).ok).toBe(false)
    expect(parseForm({ ...defaultForm('X', now), end: '2026-06-16' }, now).ok).toBe(false)
  })
})
