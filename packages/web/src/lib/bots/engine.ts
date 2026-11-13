import { BAR_MS, type Candle } from '@crypz/exchanges'
import { prepareCandles } from './data'
import { levels, sizePosition, snap } from './sizing'
import { computeSeries, rawStop, ready, signalAt, trendIndexAt, trendOf } from './strategy'
import type { BacktestResult, BotConfig, BotTrade, ExitReason, Side, Skipped, Spec } from './types'

// The backtest engine: candles and a config in, trades and an equity curve out. No UI, no network, no clock, so the
// same inputs always give the same result.
//
// Fill model
//  - the signal is read at the close of an entry candle; the order fills at the next candle's open (taker, with
//    adverse slippage), never at the signal candle's close
//  - a candle that reaches the stop is a stop even when it also reaches the target (a candle cannot say which came
//    first, so the worse is assumed); a candle that opens past the stop fills at its open
//  - the target is a limit order: it fills at its price, or at the open when the candle gaps past it; no slippage
//  - a position still open at the last candle closes at that close (end_of_data), with slippage
//  - every fill pays the taker fee on its notional

export type RunOutcome = { ok: true; result: BacktestResult } | { ok: false; errors: string[] }

const dirOf = (side: Side) => (side === 'long' ? 1 : -1)

/** Does `k` reach the stop or the target, and where does it fill? */
export function exitOn(
  side: Side,
  k: Candle,
  stop: number,
  target: number,
): { ref: number; reason: Exclude<ExitReason, 'end_of_data'> } | null {
  if (side === 'long') {
    if (k.open <= stop) return { ref: k.open, reason: 'SL' }
    if (k.low <= stop) return { ref: stop, reason: 'SL' }
    if (k.high >= target) return { ref: Math.max(target, k.open), reason: 'TP' }
    return null
  }
  if (k.open >= stop) return { ref: k.open, reason: 'SL' }
  if (k.high >= stop) return { ref: stop, reason: 'SL' }
  if (k.low <= target) return { ref: Math.min(target, k.open), reason: 'TP' }
  return null
}

export function runBacktest(cfg: BotConfig, spec: Spec, rawEntry: Candle[], rawTrend: Candle[]): RunOutcome {
  const entryMs = BAR_MS[cfg.entryBar]
  const trendMs = BAR_MS[cfg.trendBar]
  const errors: string[] = []
  if (trendMs <= entryMs) errors.push('The trend timeframe must be longer than the entry timeframe.')
  if (!(cfg.initialEquity > 0)) errors.push('Initial equity must be above 0.')
  if (!(cfg.riskPct > 0 && cfg.riskPct <= 100)) errors.push('Risk per trade must be between 0 and 100%.')
  if (!(cfg.rr > 0)) errors.push('Risk:reward must be above 0.')
  if (!(cfg.endMs > cfg.startMs)) errors.push('The end date must be after the start date.')
  if (!(cfg.feeRate >= 0) || !(cfg.slippageBps >= 0)) errors.push('Fee and slippage cannot be negative.')
  if (!(cfg.emaFast < cfg.emaMid && cfg.emaMid < cfg.emaSlow))
    errors.push('EMA periods must increase: fast < mid < slow.')
  const e = prepareCandles(rawEntry, entryMs, cfg.entryBar)
  const t = prepareCandles(rawTrend, trendMs, cfg.trendBar)
  errors.push(...e.errors, ...t.errors)
  if (errors.length) return { ok: false, errors }

  const entry = computeSeries(e.candles, cfg)
  const trend = computeSeries(t.candles, cfg)
  const c = e.candles

  const firstIdx = c.findIndex((k) => k.time >= cfg.startMs)
  // the last entry candle that closed inside the window
  let lastIdx = -1
  for (let i = c.length - 1; i >= 0; i--)
    if (c[i].time + entryMs <= cfg.endMs) {
      lastIdx = i
      break
    }
  if (firstIdx < 0 || lastIdx <= firstIdx) return { ok: false, errors: ['No entry candles inside the chosen dates.'] }

  const warnings: string[] = []
  const firstReady = c.findIndex((_, i) => ready(entry, i))
  if (firstReady < 0 || firstReady > lastIdx)
    return {
      ok: false,
      errors: ['Not enough candles to warm the indicators up. Pick a longer range or a smaller timeframe.'],
    }
  if (firstReady > firstIdx)
    warnings.push(
      `Indicators were still warming up at the start date: the first signal can come at ${new Date(c[firstReady].time).toISOString().slice(0, 16)}Z at the earliest.`,
    )
  if (!t.candles.some((_, j) => !Number.isNaN(trend.emaSlow[j])))
    return { ok: false, errors: [`Not enough ${cfg.trendBar} candles for the EMA${cfg.emaSlow}.`] }
  if (e.missing || t.missing)
    warnings.push(
      `Missing candles were left as gaps, not filled: ${e.missing} on ${cfg.entryBar}, ${t.missing} on ${cfg.trendBar}.`,
    )
  if (e.duplicates + t.duplicates) warnings.push(`${e.duplicates + t.duplicates} duplicate candles were dropped.`)
  if (e.unsorted || t.unsorted) warnings.push('Candles arrived out of order and were sorted oldest first.')

  const slip = cfg.slippageBps / 1e4
  let equity = cfg.initialEquity
  const trades: BotTrade[] = []
  const skipped: Skipped[] = []
  const curve = [{ time: cfg.startMs, equity }]
  let tj = 0

  for (let i = Math.max(firstIdx, 1); i < lastIdx; i++) {
    if (equity <= 0) break
    const closeTime = c[i].time + entryMs
    tj = trendIndexAt(t.candles, trendMs, closeTime, tj)
    const side = signalAt(entry, i, tj < 0 ? null : trendOf(trend, tj), cfg)
    if (!side) continue

    const fillCandle = c[i + 1]
    const d = dirOf(side)
    const skip = (reason: string) => skipped.push({ time: closeTime, side, reason })

    // market fill at the next open, slippage against us, then onto the price step against us too
    const entryPrice = snap(fillCandle.open * (1 + d * slip), spec.tickSz, side === 'long' ? 'up' : 'down')
    const { stop, target } = levels(side, entryPrice, rawStop(entry, i, side, cfg), cfg.rr, spec.tickSz)
    if (d * (entryPrice - stop) <= 0) {
      skip('stop is not on the loss side of the entry')
      continue
    }
    if (Math.abs(entryPrice - stop) < cfg.minStopAtr * entry.atr[i]) {
      skip('stop too close to the entry')
      continue
    }
    const size = sizePosition({
      equity,
      riskPct: cfg.riskPct,
      entry: entryPrice,
      stop,
      spec,
      maxLeverage: cfg.maxLeverage,
    })
    if (!size.ok) {
      skip(size.reason)
      continue
    }

    // walk forward from the fill candle itself: it can stop the position out too
    let exitIdx = lastIdx
    let ref = c[lastIdx].close
    let reason: ExitReason = 'end_of_data'
    for (let j = i + 1; j <= lastIdx; j++) {
      const hit = exitOn(side, c[j], stop, target)
      if (hit) {
        exitIdx = j
        ref = hit.ref
        reason = hit.reason
        break
      }
    }
    // stops and the final close are market orders; a target is a resting limit
    const exitPrice = reason === 'TP' ? ref : ref * (1 - d * slip)
    const gross = d * (exitPrice - entryPrice) * size.qtyBase
    const fees = cfg.feeRate * (size.notional + exitPrice * size.qtyBase)
    const net = gross - fees
    const before = equity
    equity += net
    trades.push({
      id: trades.length + 1,
      side,
      signalTime: closeTime,
      entryTime: fillCandle.time,
      entry: entryPrice,
      stop,
      target,
      exitTime: c[exitIdx].time,
      exit: exitPrice,
      reason,
      contracts: size.contracts,
      qtyBase: size.qtyBase,
      notional: size.notional,
      riskBudget: size.riskBudget,
      grossPnl: gross,
      fees,
      slippageCost: (Math.abs(entryPrice - fillCandle.open) + Math.abs(exitPrice - ref)) * size.qtyBase,
      netPnl: net,
      r: net / size.riskBudget,
      equityBefore: before,
      equityAfter: equity,
    })
    curve.push({ time: c[exitIdx].time, equity })
    // a signal on the very candle the trade closed in is still allowed: it closed after the exit
    i = exitIdx - 1
  }

  return {
    ok: true,
    result: {
      config: cfg,
      trades,
      skipped,
      equity: curve,
      coverage: {
        entryCandles: c.slice(firstIdx, lastIdx + 1).length,
        trendCandles: t.candles.length,
        firstTime: c[firstIdx].time,
        lastTime: c[lastIdx].time,
        missingEntry: e.missing,
        missingTrend: t.missing,
        duplicatesDropped: e.duplicates + t.duplicates,
      },
      warnings,
    },
  }
}
