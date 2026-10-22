import { fmtPrice } from '@/lib/format'
import { sessionsBetween } from '@/lib/indicators/sessions'
import { BAR_MS, type Candle } from '@crypz/exchanges'
import { computeBias, type Bias, type Side } from '@/lib/indicators/bias'
import { atr } from '@/lib/indicators/fvg'
import { findLiquidity, type Liquidity } from '@/lib/indicators/liquidity'
import { findZones, type Zone } from '@/lib/indicators/order-blocks'
import { marketStructure, type Structure } from '@/lib/indicators/structure'
import { defineStrategy, type Rule } from './define'
import { ago, barsSince, newest } from './helpers'
import type { Check, Plan } from './types'

// Sweep and order block, reversal at 3R. With the higher timeframe's bias, wait for price to sweep a swing low (long)
// or high (short) against it, alone or as a pool of equals, break structure back the bias's way, and leave an unmitigated order block
// on the way out; the entry is a limit at the middle of that block, the stop just beyond it, the target the nearest
// swing in the bias's direction, which has to be at least 3R away or the trade is skipped.

/** A sweep older than this many bars is stale. */
const SWEEP_WINDOW = 30
const MIN_REWARD = 3
/** Stop distance past the block's far edge, in ATRs. */
const STOP_BUFFER = 0.25

const PARAMS = { swing: 5, tolerance: 0.1, minTouches: 1, impulse: 1.5 }
const BIAS_FRAME = '4H'

type Ctx = {
  candles: Candle[]
  /** Direction from the bias; null while there is none. */
  side: Side | null
  bias: Bias
  /** The timeframe the bias was read from. */
  biasLabel: string
  structure: Structure
  zones: Zone[]
  liquidity: Liquidity
  /** ATR at the last candle, or NaN while there are too few bars. */
  atr: number
}

const WAIT: Check = { met: false, detail: 'Needs a bias' }
const NO_SWEEP: Check = { met: false, detail: 'Needs a sweep' }

const label = (side: 'high' | 'low', touches: number) =>
  touches > 1 ? `${side === 'low' ? 'EQL' : 'EQH'} ${touches}` : side === 'low' ? 'Swing low' : 'Swing high'

/** The newest sweep of a pool against the bias, if it is still fresh. */
function freshSweep(c: Ctx) {
  if (!c.side) return null
  const swept = c.side === 'bull' ? 'low' : 'high'
  const w = newest(c.liquidity.sweeps, (s) => s.side === swept && s.level.swings.length >= PARAMS.minTouches)
  if (!w) return null
  const age = barsSince(c.candles, w.time)
  return age <= SWEEP_WINDOW ? { sweep: w, age } : null
}

/** The block the entry would rest in: unspent, formed from the sweep on, and not yet tapped (or tapped right now). */
function block(c: Ctx) {
  const found = freshSweep(c)
  if (!found || !c.side) return null
  const want = c.side === 'bull' ? 'demand' : 'supply'
  const last = c.candles[c.candles.length - 1]
  const zone = newest(c.zones, (z) => z.side === want && z.spentAt === null && z.start >= found.sweep.time)
  if (!zone) return null
  const inside = last.low <= zone.top && last.high >= zone.bottom
  return { zone, inside, fresh: zone.taps === 0 || (zone.taps === 1 && inside) }
}

function planFor(c: Ctx): Plan | null {
  const b = block(c)
  if (!b || !c.side || Number.isNaN(c.atr)) return null
  const bull = c.side === 'bull'
  const entry = (b.zone.top + b.zone.bottom) / 2
  const stop = bull ? b.zone.bottom - STOP_BUFFER * c.atr : b.zone.top + STOP_BUFFER * c.atr
  const target = (bull ? c.structure.lastHigh : c.structure.lastLow)?.price
  if (target === undefined || (bull ? target <= entry : target >= entry)) return null
  return { side: c.side, entry, stop, target, reward: Math.abs(target - entry) / Math.abs(entry - stop) }
}

const rules: Rule<Ctx>[] = [
  {
    id: 'bias',
    label: 'Bias',
    hint: 'The higher timeframe’s structure leans one way and the chart has not closed through its invalidation. That way is the trade’s direction.',
    check: (c) =>
      c.side
        ? { met: true, detail: `${c.side === 'bull' ? 'Bullish' : 'Bearish'} · ${c.biasLabel}` }
        : { met: false, detail: 'Neutral' },
  },
  {
    id: 'session',
    label: 'Session',
    hint: 'The candle is inside the London or New York session. Asia and the gaps between sessions are skipped.',
    check: (c) => {
      const t = c.candles[c.candles.length - 1].time
      const open = sessionsBetween(t, t).filter((s) => s.id !== 'asia')
      return open.length
        ? { met: true, detail: open.map((s) => s.name).join(' + ') }
        : { met: false, detail: 'Outside London and New York' }
    },
  },
  {
    id: 'sweep',
    label: 'Liquidity sweep',
    hint: `A swing low (long) or swing high (short), alone or as a pool of equals, was swept against the bias within the last ${SWEEP_WINDOW} bars: a wick through it that closed back.`,
    check: (c) => {
      if (!c.side) return WAIT
      const f = freshSweep(c)
      return f
        ? {
            met: true,
            detail: `${label(f.sweep.level.side, f.sweep.level.swings.length)} · ${ago(f.age)}`,
          }
        : { met: false, detail: `None in the last ${SWEEP_WINDOW} bars` }
    },
  },
  {
    id: 'shift',
    label: 'Structure shift',
    hint: 'After the sweep, a candle closed through a swing in the bias’s direction (BOS or CHoCH): price is leaving the level, not just poking it.',
    check: (c) => {
      if (!c.side) return WAIT
      const f = freshSweep(c)
      if (!f) return NO_SWEEP
      const dir = c.side === 'bull' ? 'up' : 'down'
      const b = newest(c.structure.breaks, (x) => x.dir === dir && x.time > f.sweep.time)
      return b
        ? { met: true, detail: `${b.type} · ${ago(barsSince(c.candles, b.time))}` }
        : { met: false, detail: 'No break since the sweep' }
    },
  },
  {
    id: 'block',
    label: 'Order block',
    hint: 'An order block with an imbalance formed from the sweep on, with price not yet back in it: the limit entry waits at its middle. Met on its first tap too.',
    check: (c) => {
      if (!c.side) return WAIT
      if (!freshSweep(c)) return NO_SWEEP
      const b = block(c)
      if (!b) return { met: false, detail: 'No block since the sweep' }
      const range = `${fmtPrice(b.zone.bottom)}–${fmtPrice(b.zone.top)}`
      return b.fresh
        ? { met: true, detail: `${b.inside ? 'Tapping' : 'Waiting'} ${range}` }
        : { met: false, detail: `Tapped ${range}` }
    },
  },
  {
    id: 'reward',
    label: `Reward ${MIN_REWARD}R`,
    hint: `Entry at the block’s middle, stop a quarter ATR past its far edge, target the nearest swing in the bias’s direction. It must be at least ${MIN_REWARD}R away or the trade is skipped.`,
    check: (c) => {
      if (!c.side) return WAIT
      const plan = planFor(c)
      if (!plan) return { met: false, detail: 'No block or no target' }
      return {
        met: plan.reward >= MIN_REWARD,
        detail: `${plan.reward.toFixed(1)}R to ${fmtPrice(plan.target)}`,
        plan,
      }
    },
  },
]

export const sweepOrderBlock = defineStrategy<Ctx>({
  id: 'sweep-ob',
  name: 'Sweep + order block',
  summary:
    'Trade the reversal after a liquidity grab, with the higher timeframe. Limit entry in the order block it leaves, at least 3R to the next swing.',
  frames: [BIAS_FRAME],
  settings: `Bias from ${BIAS_FRAME} · swing ${PARAMS.swing} bars · equals within ${PARAMS.tolerance} ATR · blocks ${PARAMS.impulse} ATR with a gap`,
  context: ({ candles, barLabel, series }) => {
    if (!candles.length) return null
    // a bias frame at or below the chart's own adds nothing: the bias reads the chart's structure then
    const higher = BAR_MS[BIAS_FRAME] > BAR_MS[barLabel] ? (series[BIAS_FRAME] ?? null) : null
    const bias = computeBias({
      chart: candles,
      chartLabel: barLabel,
      higher,
      higherLabel: higher ? BIAS_FRAME : null,
      length: PARAMS.swing,
    })
    return {
      candles,
      side: bias.side,
      bias,
      biasLabel: higher ? BIAS_FRAME : barLabel,
      structure: marketStructure(candles, PARAMS.swing),
      zones: findZones(candles, {
        strength: PARAMS.impulse,
        imbalance: true,
        withTrend: false,
        swing: PARAMS.swing,
      }),
      liquidity: findLiquidity(candles, { tolerance: PARAMS.tolerance, swing: PARAMS.swing }),
      atr: atr(candles).at(-1) ?? Number.NaN,
    }
  },
  rules,
})
