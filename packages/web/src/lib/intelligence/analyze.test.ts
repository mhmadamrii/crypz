import { describe, expect, it } from 'vitest'
import { BAR_MS } from '@crypz/exchanges'
import { analyze, tagFor } from './analyze'
import { input, NOW, series, SYMBOL, sideways, uptrend } from './fixtures'
import { HORIZON_CONFIG } from './horizons'
import { marketState } from './market-state'
import { HORIZONS } from './types'

describe('market state', () => {
  it('labels nothing without enough bars', () => {
    const s = marketState(uptrend().slice(-30), { window: 4, swing: 5 })
    expect(s.state.structure).toBe('unclear')
    expect(s.state.volatility.state).toBe('unclear')
    expect(s.refs).toBeNull()
  })

  it('reads an uptrend as bullish and a flat oscillation as ranging', () => {
    expect(marketState(uptrend(), { window: 4, swing: 5 }).state.structure).toBe('bullish')
    expect(marketState(sideways(), { window: 4, swing: 5 }).state.structure).toBe('ranging')
  })

  it('reads volatility against its own baseline', () => {
    const calm = series(200, 1, (i) => 100 + (i % 2 ? 0.1 : -0.1))
    const spike = calm.map((k, i) => (i >= 195 ? { ...k, high: k.close + 6, low: k.close - 6 } : k))
    expect(marketState(spike, { window: 4, swing: 5 }).state.volatility.state).toBe('high')
  })
})

describe('analyze', () => {
  it('produces a full qualitative analysis from fresh, matching data', () => {
    const a = analyze(input())
    expect(a.dataQuality.status).toBe('good')
    expect(a.engines.map((e) => e.id)).toEqual(['structure', 'liquidity', 'flow', 'positioning', 'forced'])
    expect(a.engines.every((e) => e.state !== 'unavailable')).toBe(true)
    expect(a.model).toMatchObject({ mode: 'qualitative', calibrated: false })
    expect(a.bar).toBe('15m')
    expect(a.windowBars).toBe(4)
  })

  it('never shows a probability: ranks only, and exactly the six scenarios', () => {
    const a = analyze(input())
    expect(a.scenarios.map((s) => s.id).sort()).toEqual([
      'bearish_continuation',
      'bearish_reversal',
      'bullish_continuation',
      'bullish_reversal',
      'failed_breakout',
      'range',
    ])
    for (const s of a.scenarios) {
      expect(s.probability).toBeUndefined()
      expect(['favored', 'possible', 'less_likely']).toContain(s.qualitativeRank)
    }
    expect(a.scenarios.filter((s) => s.qualitativeRank === 'favored').length).toBeLessThanOrEqual(1)
  })

  it('never ranks a scenario possible when nothing supports it', () => {
    for (const h of HORIZONS)
      for (const s of analyze(input({}, h)).scenarios)
        if (s.qualitativeRank !== 'less_likely') expect(s.supportingEvidence.length).toBeGreaterThan(0)
  })

  it('ranks the leader first and marks scenarios the structure rules out as not applicable', () => {
    const a = analyze(input())
    expect(a.marketState.structure).toBe('bullish')
    const bearCont = a.scenarios.find((s) => s.id === 'bearish_continuation')!
    expect(bearCont.applicable).toBe(false)
    expect(bearCont.qualitativeRank).toBe('less_likely')
    expect(bearCont.explanation).toMatch(/Not applicable/)
    expect(a.scenarios[0].applicable).toBe(true)
  })

  it('favors nothing when fewer than three engines can be read', () => {
    const base = input()
    const gone = (tag: string) => ({ data: null, at: null, tag })
    const a = analyze(
      input({
        book: null,
        taker: gone(base.taker.tag),
        openInterest: gone(base.openInterest.tag),
        liquidations: gone(base.liquidations.tag),
        tape: gone(base.tape.tag),
      }),
    )
    expect(a.engines.filter((e) => e.state !== 'unavailable').length).toBeLessThan(3)
    expect(a.scenarios.some((s) => s.qualitativeRank === 'favored')).toBe(false)
    expect(a.scenarios.some((s) => s.qualitativeRank === 'possible')).toBe(true)
  })

  it('gives every scenario a trigger, an invalidation and its levels', () => {
    for (const s of analyze(input()).scenarios) {
      expect(s.trigger.length).toBeGreaterThan(10)
      expect(s.invalidation.length).toBeGreaterThan(10)
      expect(s.keyLevelIds.length).toBeGreaterThan(0)
    }
  })

  it('is insufficient, with no scenarios, when the candles are missing, stale or too few', () => {
    const tag = tagFor.candles(SYMBOL, '1H')
    for (const candles of [
      { data: null, at: null, tag },
      { data: uptrend(), at: NOW - 10 * 60_000, tag },
      { data: uptrend().slice(-30), at: NOW - 1000, tag },
    ]) {
      const a = analyze(input({ candles }))
      expect(a.dataQuality.status).toBe('insufficient')
      expect(a.scenarios).toEqual([])
      expect(a.engines).toEqual([])
    }
  })

  it('does not use data from another instrument or interval', () => {
    // candles for the 4H horizon's bar offered to the 1H horizon
    const wrongBar = { data: uptrend(), at: NOW - 1000, tag: tagFor.candles(SYMBOL, '4H') }
    expect(analyze(input({ candles: wrongBar })).dataQuality.status).toBe('insufficient')
    const wrongSymbol = { data: uptrend(), at: NOW - 1000, tag: tagFor.candles('ETH-USDT-SWAP', '1H') }
    expect(analyze(input({ candles: wrongSymbol })).dataQuality.status).toBe('insufficient')

    // derivatives from another period count as missing, not as this horizon's
    const a = analyze(input({ openInterest: { ...input().openInterest, tag: tagFor.stat(SYMBOL, '4H') } }))
    expect(a.engines.find((e) => e.id === 'positioning')!.state).toBe('unavailable')
    expect(a.dataQuality.missingSources).toContain('Open interest')
  })

  it('reads each horizon on its own bar and window', () => {
    for (const h of HORIZONS) {
      const a = analyze(input({}, h))
      expect(a.horizon).toBe(h)
      expect(a.bar).toBe(HORIZON_CONFIG[h].bar)
      expect(a.windowBars * BAR_MS[a.bar]).toBeGreaterThanOrEqual(5 * 60_000)
      expect(a.dataQuality.status).toBe('good')
    }
  })

  it('names a stale feed, drops its engine, and degrades instead of substituting', () => {
    const base = input()
    const a = analyze(input({ taker: { ...base.taker, at: NOW - 20 * 60_000 } }))
    expect(a.dataQuality.status).toBe('degraded')
    expect(a.dataQuality.staleSources).toContain('Taker volume')
    const flow = a.engines.find((e) => e.id === 'flow')!
    // the tape is a different source; it stands in only openly, and the stale taker series is not read
    expect(flow.items.some((i) => i.id === 'taker-flow')).toBe(false)
  })

  it('hides the book when it is not live, however recent its last update was', () => {
    const base = input()
    for (const state of ['stale', 'disconnected', 'loading'] as const) {
      const a = analyze(input({ book: { ...base.book!, state } }))
      expect(a.engines.find((e) => e.id === 'liquidity')!.state).toBe('unavailable')
      expect(a.keyLevels.some((l) => l.live)).toBe(false)
    }
  })

  it('counts one vote per engine: the tape does not vote when taker volume is there', () => {
    const flow = analyze(input()).engines.find((e) => e.id === 'flow')!
    expect(flow.items.filter((i) => i.votes)).toHaveLength(1)
    expect(flow.items.find((i) => i.id === 'tape')!.votes).toBe(false)
  })

  it('lets the tape vote, and says so, only when taker volume is unavailable', () => {
    const base = input()
    const flow = analyze(input({ taker: { data: null, at: null, tag: base.taker.tag } })).engines.find(
      (e) => e.id === 'flow',
    )!
    expect(flow.items.find((i) => i.id === 'tape')!.votes).toBe(true)
    expect(flow.reason).toMatch(/unavailable/)
  })

  it('reads one-sided forced closes, and stays neutral on a quiet tape of liquidations', () => {
    const ev = (side: 'long' | 'short', n: number) =>
      Array.from({ length: n }, (_, i) => ({ time: NOW - 1000 * (i + 1), side, usd: 10_000 }))
    const base = input()
    const longs = analyze(input({ liquidations: { ...base.liquidations, data: ev('long', 8) } })).engines.find(
      (e) => e.id === 'forced',
    )!
    expect(longs.state).toBe('bearish')
    const quiet = analyze(input({ liquidations: { ...base.liquidations, data: ev('long', 2) } })).engines.find(
      (e) => e.id === 'forced',
    )!
    expect(quiet.state).toBe('neutral')
  })

  it('does not trust a move carried by the crowded side', () => {
    const stat = BAR_MS['15m']
    const base = input()
    const oi = Array.from({ length: 10 }, (_, i) => ({ time: NOW - (10 - i) * stat, contracts: 1, usd: 1000 + i * 50 }))
    const crowded = analyze(
      input({
        openInterest: { ...base.openInterest, data: oi },
        longShort: { ...base.longShort, data: [{ time: NOW, ratio: 1.6 }] },
        funding: { ...base.funding, data: 0.0006 },
      }),
    ).engines.find((e) => e.id === 'positioning')!
    expect(crowded.state).toBe('mixed')
    const open = analyze(input({ openInterest: { ...base.openInterest, data: oi } })).engines.find(
      (e) => e.id === 'positioning',
    )!
    expect(open.state).toBe('bullish')
  })

  it('shows only a few levels, each with a source and a time', () => {
    const a = analyze(input())
    expect(a.keyLevels.length).toBeGreaterThan(2)
    expect(a.keyLevels.length).toBeLessThan(14)
    for (const l of a.keyLevels) {
      expect(l.source.length).toBeGreaterThan(3)
      expect(Number.isFinite(l.price)).toBe(true)
    }
    expect(a.keyLevels.filter((l) => l.live).every((l) => /cancel/.test(l.source))).toBe(true)
  })
})
