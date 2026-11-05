import { BAR_MS } from '@crypz/exchanges'
import type { KeyLevel, MarketIntelligence, Scenario, ScenarioId } from './types'

export type OutlookPoint = { time: number; price: number }

export type OutlookPath = {
  id: ScenarioId
  rank: Scenario['qualitativeRank']
  /** Direction the shape argues for; colour is an echo of the word, same convention as everywhere else. */
  tone: 'up' | 'down' | 'risk' | 'neutral'
  points: OutlookPoint[]
}

const STEPS = 16

function nearest(levels: KeyLevel[], price: number, dir: 'above' | 'below') {
  const candidates = levels.filter((l) => (dir === 'above' ? l.price > price : l.price < price))
  if (!candidates.length) return null
  return candidates.reduce((a, b) => (Math.abs(b.price - price) < Math.abs(a.price - price) ? b : a))
}

/** t in [0,1] -> price offset in units of `span` (the room to the nearest level on the move's side). t=0 is always 0. */
const SHAPE: Record<ScenarioId, (t: number) => number> = {
  // a small pullback right away, then a clean push through the nearest resistance
  bullish_continuation: (t) => t * 1.15 - 0.18 * Math.sin(t * Math.PI * 2) * Math.exp(-t * 3),
  bearish_continuation: (t) => -(t * 1.15 - 0.18 * Math.sin(t * Math.PI * 2) * Math.exp(-t * 3)),
  // retraces toward the invalidation side first, then reverses through the starting price
  bullish_reversal: (t) => (t < 0.35 ? -t * 1.4 : -0.49 + (t - 0.35) * 2.3),
  bearish_reversal: (t) => (t < 0.35 ? t * 1.4 : 0.49 - (t - 0.35) * 2.3),
  // oscillates between the levels either side and ends back near where it started
  range: (t) => Math.sin(t * Math.PI * 2.4) * 0.55,
  // pokes through a level, then fails and snaps back past the starting price
  failed_breakout: (t) => (t < 0.45 ? t * 2.2 : 0.99 - (t - 0.45) * 2.4),
}

const toneOf = (id: ScenarioId): OutlookPath['tone'] =>
  id.startsWith('bullish') ? 'up' : id.startsWith('bearish') ? 'down' : id === 'failed_breakout' ? 'risk' : 'neutral'

/**
 * A schematic projected path per applicable scenario: illustrative shape only, anchored on the real live price and
 * the real nearest key levels. The qualitative engine has never been measured against history, so a path never
 * claims an exact future price — it draws the archetype (continuation, reversal, range, failed breakout), including
 * the retrace every one of them has, fanned out from the one point that is real: the price right now.
 */
export function buildOutlookPaths(a: MarketIntelligence): OutlookPath[] {
  if (a.price === null) return []
  const price = a.price
  const barMs = BAR_MS[a.bar]
  const res = nearest(a.keyLevels, price, 'above')
  const sup = nearest(a.keyLevels, price, 'below')
  // the room either side; a floor so a level-less instrument still gets a readable fan
  const span = Math.max(res ? res.price - price : 0, sup ? price - sup.price : 0, price * 0.006)

  return a.scenarios
    .filter((s) => s.applicable)
    .map((s) => ({
      id: s.id,
      rank: s.qualitativeRank,
      tone: toneOf(s.id),
      points: Array.from({ length: STEPS + 1 }, (_, i) => {
        const t = i / STEPS
        return { time: a.asOf + barMs * a.windowBars * t, price: price + SHAPE[s.id](t) * span }
      }),
    }))
}
