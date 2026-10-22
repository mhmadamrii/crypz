import { BAR_MS, type Bar, type Candle } from '@crypz/exchanges'
import { fmtPrice } from '@/lib/format'
import { computeBias, type Bias, type Side } from '@/lib/indicators/bias'
import { atr } from '@/lib/indicators/fvg'
import { findZones, type Zone } from '@/lib/indicators/order-blocks'
import { marketStructure, type Structure } from '@/lib/indicators/structure'
import { defineStrategy, type Rule } from './define'
import { ago } from './helpers'
import type { Check, Plan } from './types'

// JeaFX: trade the pullback into a zone, with the higher timeframe, and enter on the lower timeframe's proof.
//
// The 4H bias gives the direction. On 30m, the order block (demand for a bullish bias, supply for a bearish one)
// price is working back into is the zone. When price touches it, the 5m chart is watched for a change of character
// the bias's way (CHoCH). The entry is the last candle before the impulsive move that made the CHoCH: a limit at its
// middle, the stop just past its far edge, the target the nearest unbroken 30m swing, which must be far enough away.
// No CHoCH and the zone breaks (a 30m close through it)? Then it is dropped and the next zone below (above, for a
// short) takes its place, and the same checklist starts over.
//
// Zones are the same order blocks the indicator finds, so nothing is drawn by hand: a zone is known from the 30m
// candle that completes its impulse, and everything is read from closed candles only.

const BIAS_FRAME: Bar = '4H'
const ZONE_FRAME: Bar = '30m'
const TRIGGER_FRAME: Bar = '5m'

const P = {
  /** Swing length, in bars each side, for each timeframe's structure. */
  biasSwing: 5,
  zoneSwing: 5,
  triggerSwing: 3,
  /** How far the 30m impulse that makes a zone must travel, in ATRs (with a gap in it). */
  impulse: 1.5,
  /** A touch of the zone older than this many 5m bars no longer counts. */
  touchWindow: 48,
  /** A CHoCH older than this many 5m bars is stale. */
  chochWindow: 36,
  /** Where in the entry candle the limit sits, from its far edge: 0.5 is the middle. */
  entryAt: 0.5,
  /** Stop distance past the entry candle's far edge, in 5m ATRs. */
  stopBuffer: 0.25,
  minReward: 2.5,
  /** The entry candle may sit this many 5m bars after price left the zone: the impulse must start from it. */
  leaveBars: 2,
  /** The impulse leg is looked for this many 5m bars back from the candle that closed through. */
  maxLeg: 8,
}

type Visit = { first: number; last: number }

type Entry = {
  base: Candle
  entry: number
  stop: number
  /** What has happened to the limit since the CHoCH. */
  state: 'waiting' | 'filling' | 'filled' | 'stopped' | 'away'
  /** Bars since the fill, when filled. */
  filledAgo: number
}

type Ctx = {
  side: Side | null
  bias: Bias
  biasLabel: string
  m5: Candle[]
  m30Structure: Structure
  m5Structure: Structure
  /** The zone being worked, and how price has been visiting it on the 5m chart. */
  zone: { zone: Zone; visit: Visit | null } | null
  atr5: number
}

const overlaps = (c: Candle, z: Zone) => c.low <= z.top && c.high >= z.bottom

/** A zone is broken once a 30m candle after it formed closes through its far edge. */
function broken(z: Zone, m30: Candle[], side: Side) {
  for (let i = m30.length - 1; i >= 0 && m30[i].time > z.formedAt; i--)
    if (side === 'bull' ? m30[i].close < z.bottom : m30[i].close > z.top) return true
  return false
}

/** The latest run of 5m candles inside the zone, within the touch window; null when price has not been in it. */
function visitOf(z: Zone, m5: Candle[]): Visit | null {
  // the zone is known once its completing 30m candle has closed
  const from = z.formedAt + BAR_MS[ZONE_FRAME]
  const floor = Math.max(0, m5.length - 1 - P.touchWindow)
  let last = -1
  for (let i = m5.length - 1; i >= floor && m5[i].time >= from; i--)
    if (overlaps(m5[i], z)) {
      last = i
      break
    }
  if (last < 0) return null
  let first = last
  while (first > 0 && m5[first - 1].time >= from && overlaps(m5[first - 1], z)) first--
  return { first, last }
}

/** The zone to work: the one price visited most recently, else the nearest one on the near side of price. */
function pickZone(zones: Zone[], m5: Candle[], m30: Candle[], side: Side) {
  const price = m5[m5.length - 1].close
  const want = side === 'bull' ? 'demand' : 'supply'
  const live = zones.filter(
    (z) => z.side === want && (side === 'bull' ? z.bottom <= price : z.top >= price) && !broken(z, m30, side),
  )
  const distance = (z: Zone) => Math.max(0, side === 'bull' ? price - z.top : z.bottom - price)
  let best: { zone: Zone; visit: Visit | null } | null = null
  for (const zone of live) {
    const visit = visitOf(zone, m5)
    const better =
      !best ||
      (visit && !best.visit) ||
      (visit && best.visit && visit.last > best.visit.last) ||
      (!visit && !best.visit && distance(zone) < distance(best.zone))
    if (better) best = { zone, visit }
  }
  return best
}

/** The first CHoCH the bias's way since price touched the zone: the zone's reaction, not a later swing of price. */
function choch(c: Ctx) {
  if (!c.side || !c.zone?.visit) return null
  const since = c.m5[c.zone.visit.first].time
  const dir = c.side === 'bull' ? 'up' : 'down'
  return c.m5Structure.breaks.find((b) => b.type === 'CHoCH' && b.dir === dir && b.time >= since) ?? null
}

/** The entry candle: the last one that did not move the bias's way before the run that closed through. */
function entryFor(c: Ctx): Entry | null {
  const b = choch(c)
  if (!b || !c.side || Number.isNaN(c.atr5)) return null
  const bull = c.side === 'bull'
  const withBias = (k: Candle) => (bull ? k.close > k.open : k.close < k.open)
  let i = b.index
  while (i > 0 && withBias(c.m5[i]) && b.index - i < P.maxLeg) i--
  // a break candle that itself went against the bias (it opened above the level) has no run: take the one before it
  const baseAt = i === b.index ? Math.max(0, i - 1) : i
  const base = c.m5[baseAt]
  const range = base.high - base.low
  const entry = bull ? base.high - range * P.entryAt : base.low + range * P.entryAt
  const stop = bull ? base.low - P.stopBuffer * c.atr5 : base.high + P.stopBuffer * c.atr5
  const visit = c.zone!.visit!
  // the run that made the CHoCH must start from the zone, not from wherever price had wandered to since
  let state: Entry['state'] = baseAt > visit.last + P.leaveBars ? 'away' : 'waiting'
  let filledAgo = 0
  for (let k = b.index + 1; state !== 'away' && k < c.m5.length; k++) {
    const k5 = c.m5[k]
    if (bull ? k5.low <= stop : k5.high >= stop) {
      state = 'stopped'
      break
    }
    if (state !== 'filled' && (bull ? k5.low <= entry : k5.high >= entry)) {
      state = 'filled'
      filledAgo = c.m5.length - 1 - k
    }
  }
  if (state === 'filled' && filledAgo === 0) state = 'filling'
  return { base, entry, stop, state, filledAgo }
}

const WAIT: Check = { met: false, detail: 'Needs a bias' }

const rules: Rule<Ctx>[] = [
  {
    id: 'bias',
    label: 'Bias',
    hint: `The ${BIAS_FRAME} structure leans one way and 30m has not closed through its invalidation. That way is the trade’s direction: bullish looks for demand, bearish for supply.`,
    check: (c) =>
      c.side
        ? { met: true, detail: `${c.side === 'bull' ? 'Bullish' : 'Bearish'} · ${c.biasLabel}` }
        : { met: false, detail: 'Neutral' },
  },
  {
    id: 'zone',
    label: 'Zone',
    hint: `A ${ZONE_FRAME} order block on the bias’s side of price that no ${ZONE_FRAME} candle has closed through. The one price has visited most recently, else the nearest. When a zone breaks, the next one below (above, for a short) takes over.`,
    check: (c) => {
      if (!c.side) return WAIT
      if (!c.zone) return { met: false, detail: `No ${c.side === 'bull' ? 'demand below' : 'supply above'} price` }
      const { zone } = c.zone
      return {
        met: true,
        detail: `${zone.side === 'demand' ? 'Demand' : 'Supply'} ${fmtPrice(zone.bottom)}–${fmtPrice(zone.top)}`,
      }
    },
  },
  {
    id: 'touch',
    label: 'Price in zone',
    hint: `A ${TRIGGER_FRAME} candle traded into the zone in the last ${P.touchWindow} bars. That is the cue to watch ${TRIGGER_FRAME} for confirmation.`,
    check: (c) => {
      if (!c.side) return WAIT
      if (!c.zone) return { met: false, detail: 'Needs a zone' }
      const { zone, visit } = c.zone
      if (visit) {
        const age = c.m5.length - 1 - visit.last
        return { met: true, detail: age === 0 ? 'In the zone' : `Touched ${ago(age)}` }
      }
      const price = c.m5[c.m5.length - 1].close
      const gap = (c.side === 'bull' ? price - zone.top : zone.bottom - price) / price
      return { met: false, detail: `${(gap * 100).toFixed(2)}% ${c.side === 'bull' ? 'above' : 'below'}` }
    },
  },
  {
    id: 'choch',
    label: `CHoCH (${TRIGGER_FRAME})`,
    hint: `After the touch, a ${TRIGGER_FRAME} candle closed through a swing the bias’s way against the trend (change of character), within the last ${P.chochWindow} bars. No CHoCH, no trade: wait for the next zone.`,
    check: (c) => {
      if (!c.side) return WAIT
      if (!c.zone?.visit) return { met: false, detail: 'Needs a touch' }
      const b = choch(c)
      if (!b) return { met: false, detail: `Waiting for a ${TRIGGER_FRAME} CHoCH` }
      const age = c.m5.length - 1 - b.index
      return age <= P.chochWindow
        ? { met: true, detail: `CHoCH · ${ago(age)}` }
        : { met: false, detail: `Stale · ${ago(age)}` }
    },
  },
  {
    id: 'entry',
    label: 'Entry candle',
    hint: `The last ${TRIGGER_FRAME} candle before the impulsive move that made the CHoCH. The limit sits at its middle and is live until price trades there or through the stop.`,
    check: (c) => {
      if (!c.side) return WAIT
      if (!choch(c)) return { met: false, detail: 'Needs a CHoCH' }
      const e = entryFor(c)
      if (!e) return { met: false, detail: 'Needs candles' }
      if (e.state === 'away') return { met: false, detail: 'CHoCH did not start in the zone' }
      if (e.state === 'stopped') return { met: false, detail: 'Stop hit since the CHoCH' }
      if (e.state === 'filled') return { met: false, detail: `Filled ${ago(e.filledAgo)}` }
      return { met: true, detail: e.state === 'filling' ? 'Filling now' : `Limit ${fmtPrice(e.entry)}` }
    },
  },
  {
    id: 'reward',
    label: `Reward ${P.minReward}R`,
    hint: `Entry at the candle’s middle, stop a quarter ${TRIGGER_FRAME} ATR past its far edge, target the nearest unbroken ${ZONE_FRAME} swing. It must be at least ${P.minReward}R away or the trade is skipped.`,
    check: (c) => {
      if (!c.side) return WAIT
      const e = entryFor(c)
      if (!e || e.state === 'stopped' || e.state === 'filled' || e.state === 'away')
        return { met: false, detail: 'Needs a live entry' }
      const bull = c.side === 'bull'
      const target = (bull ? c.m30Structure.lastHigh : c.m30Structure.lastLow)?.price
      if (target === undefined || (bull ? target <= e.entry : target >= e.entry))
        return { met: false, detail: `No ${ZONE_FRAME} swing to aim at` }
      const plan: Plan = {
        side: c.side,
        entry: e.entry,
        stop: e.stop,
        target,
        reward: Math.abs(target - e.entry) / Math.abs(e.entry - e.stop),
      }
      return { met: plan.reward >= P.minReward, detail: `${plan.reward.toFixed(1)}R to ${fmtPrice(target)}`, plan }
    },
  },
]

export const jeafx = defineStrategy<Ctx>({
  id: 'jeafx',
  name: 'JeaFX strategy',
  summary: `Pullback into a ${ZONE_FRAME} zone with the ${BIAS_FRAME} bias; when price touches it, enter on the candle before the impulse that makes a ${TRIGGER_FRAME} CHoCH.`,
  frames: [BIAS_FRAME, ZONE_FRAME, TRIGGER_FRAME],
  settings: `Bias ${BIAS_FRAME} · zones ${ZONE_FRAME} blocks of ${P.impulse} ATR with a gap · trigger ${TRIGGER_FRAME} swing ${P.triggerSwing} bars · ${P.minReward}R minimum`,
  context: ({ series }) => {
    const bias4 = series[BIAS_FRAME] ?? []
    const m30 = series[ZONE_FRAME] ?? []
    const m5 = series[TRIGGER_FRAME] ?? []
    if (m30.length < 2 * P.zoneSwing + 1 || m5.length < 2 * P.triggerSwing + 1) return null
    const bias = computeBias({
      chart: m30,
      chartLabel: ZONE_FRAME,
      higher: bias4.length ? bias4 : null,
      higherLabel: bias4.length ? BIAS_FRAME : null,
      length: P.biasSwing,
    })
    const zones = bias.side
      ? findZones(m30, { strength: P.impulse, imbalance: true, withTrend: false, swing: P.zoneSwing })
      : []
    return {
      side: bias.side,
      bias,
      biasLabel: bias4.length ? BIAS_FRAME : ZONE_FRAME,
      m5,
      m30Structure: marketStructure(m30, P.zoneSwing),
      m5Structure: marketStructure(m5, P.triggerSwing),
      zone: bias.side ? pickZone(zones, m5, m30, bias.side) : null,
      atr5: atr(m5).at(-1) ?? Number.NaN,
    }
  },
  rules,
})
