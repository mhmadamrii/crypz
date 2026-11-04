import { fmtPrice } from '@/lib/format'
import type { Prior } from './outcome'
import { SCENARIO_ORDER } from './outcome'
import type { Signals } from './engines'
import type { Engine, MarketState, Scenario, ScenarioId } from './types'

// The qualitative scenario engine (version 1). It RANKS the six scenarios; it does not estimate probabilities, and
// nothing here is a percentage. The score of a scenario is a small integer from explicit rules over the engines'
// votes: whether it can happen from the current structure at all, how many engines point its way minus how many
// point against, and a few specifics. The points are ordinal heuristics, chosen by hand and NOT measured against
// history, so the result is only ever shown as favored / possible / less likely, labelled qualitative. Measuring
// them against history is what a later calibrated version is for (outcome definitions: ./outcome.ts).
//
//   lean  = engines (liquidity, flow, positioning, forced) voting bullish − voting bearish   (−4 … +4)
//   bullish_continuation   only from an up structure:                2 + lean
//   bearish_continuation   only from a down structure:              2 − lean
//   bullish_reversal       not from an up structure:                 1 + lean + 2 (recent bullish CHoCH) + 1 (range, price at the high)
//   bearish_reversal       not from a down structure:               1 − lean + 2 (recent bearish CHoCH) + 1 (range, price at the low)
//   range                  2 (ranging structure) + 1 (low volatility) + 1 (|lean| ≤ 1) − 1 (high volatility)
//   failed_breakout        1 (price within ½ ATR of a reference level) + 1 (flow divergence) + 1 (crowded side)
//                          + 1 (a resting wall on the far side of the level)
//
// Ranking: the best score is "favored" only if it is at least 2, beats the next by at least 1, and at least
// MIN_ENGINES of the five engines could be read; with less evidence than that nothing is favored, however the score
// falls. Scores within 1 of the best are "possible"; the rest, and any scenario that cannot happen from this
// structure, are "less likely". A scenario with no supporting evidence at all is never better than less likely,
// however close its score is.

export const SCENARIOS: Record<ScenarioId, { name: string; definition: string }> = {
  bullish_continuation: {
    name: 'Bullish continuation',
    definition: 'From an up structure, the window ends with a close above the last swing high.',
  },
  bearish_continuation: {
    name: 'Bearish continuation',
    definition: 'From a down structure, the window ends with a close below the last swing low.',
  },
  bullish_reversal: {
    name: 'Bullish reversal',
    definition: 'From a down or ranging structure, the window ends with a close above the last swing high.',
  },
  bearish_reversal: {
    name: 'Bearish reversal',
    definition: 'From an up or ranging structure, the window ends with a close below the last swing low.',
  },
  range: {
    name: 'Range',
    definition: 'Every close in the window stays between the last swing low and high.',
  },
  failed_breakout: {
    name: 'Failed breakout',
    definition: 'A close goes beyond the swing high or low during the window, but the window ends back inside.',
  },
}

export type ScenarioInput = {
  prior: Prior
  structure: MarketState['structure']
  volatility: MarketState['volatility']['state']
  choch: 'up' | 'down' | null
  atr: number | null
  price: number
  refs: { high: number; low: number }
  engines: Engine[]
  signals: Signals
  bar: string
  windowBars: number
}

const NOT_APPLICABLE: Partial<Record<ScenarioId, string>> = {
  bullish_continuation: 'there is no up structure to continue',
  bearish_continuation: 'there is no down structure to continue',
  bullish_reversal: 'the structure is already up, so a move up is a continuation',
  bearish_reversal: 'the structure is already down, so a move down is a continuation',
}

const WIDTH = 1
/** Engines that must be readable (not unavailable) before any scenario can be called favored. */
export const MIN_ENGINES = 3
const dirOf = (e: Engine) => (e.state === 'bullish' ? 1 : e.state === 'bearish' ? -1 : 0)

export function scoreScenarios(i: ScenarioInput): Scenario[] {
  const voters = i.engines.filter((e) => e.id !== 'structure' && e.state !== 'unavailable')
  const lean = voters.reduce((a, e) => a + dirOf(e), 0)
  const near = (px: number) => (i.atr ? Math.abs(px - i.price) <= 0.5 * i.atr : false)
  const nearHigh = near(i.refs.high)
  const nearLow = near(i.refs.low)
  const wallAgainst =
    (nearHigh && i.signals.askWall && i.signals.askWall.px - i.price <= 0.005 * i.price) ||
    (nearLow && i.signals.bidWall && i.price - i.signals.bidWall.px <= 0.005 * i.price)
  const crowdedAgainst = (nearHigh && i.signals.crowding === 'long') || (nearLow && i.signals.crowding === 'short')

  const failedHits = [
    nearHigh || nearLow ? 'Price is within half an ATR of a reference level.' : null,
    i.signals.flowDivergence ? `Aggressive flow is diverging from price (${i.signals.flowDivergence}).` : null,
    crowdedAgainst ? `The ${i.signals.crowding}s are crowded at the level being tested.` : null,
    wallAgainst ? 'A big resting order sits just beyond the level (it can be cancelled).' : null,
  ].filter((x): x is string => x !== null)

  const raw: Record<ScenarioId, number | null> = {
    bullish_continuation: i.prior === 'up' ? 2 + lean : null,
    bearish_continuation: i.prior === 'down' ? 2 - lean : null,
    bullish_reversal:
      i.prior !== 'up' ? 1 + lean + (i.choch === 'up' ? 2 : 0) + (i.prior === 'range' && nearHigh ? 1 : 0) : null,
    bearish_reversal:
      i.prior !== 'down' ? 1 - lean + (i.choch === 'down' ? 2 : 0) + (i.prior === 'range' && nearLow ? 1 : 0) : null,
    range:
      (i.structure === 'ranging' ? 2 : 0) +
      (i.volatility === 'low' ? 1 : 0) +
      (Math.abs(lean) <= 1 ? 1 : 0) -
      (i.volatility === 'high' ? 1 : 0),
    failed_breakout: failedHits.length,
  }

  const readable = i.engines.filter((e) => e.state !== 'unavailable').length
  const applicable = SCENARIO_ORDER.filter((id) => raw[id] !== null)
  const best = Math.max(...applicable.map((id) => raw[id]!))
  const second = Math.max(-Infinity, ...applicable.map((id) => raw[id]!).filter((s) => s < best))
  const rankOf = (id: ScenarioId): Scenario['qualitativeRank'] => {
    const s = raw[id]
    if (s === null) return 'less_likely'
    if (s === best && best >= 2 && best - second >= WIDTH && readable >= MIN_ENGINES) return 'favored'
    return s >= best - 1 ? 'possible' : 'less_likely'
  }

  const evidenceFor = (dir: 1 | -1) => ({
    for: i.engines.filter((e) => dirOf(e) === dir).map((e) => `${e.title}: ${e.reason}`),
    against: i.engines.filter((e) => dirOf(e) === -dir).map((e) => `${e.title}: ${e.reason}`),
  })
  const up = evidenceFor(1)
  const down = evidenceFor(-1)
  const calm = i.engines.filter((e) => e.state === 'neutral').map((e) => `${e.title}: ${e.reason}`)
  const loud = i.engines.filter((e) => dirOf(e) !== 0).map((e) => `${e.title}: ${e.reason}`)
  const H = fmtPrice(i.refs.high)
  const L = fmtPrice(i.refs.low)
  const w = `${i.windowBars} × ${i.bar}`

  const detail: Record<
    ScenarioId,
    Pick<Scenario, 'supportingEvidence' | 'conflictingEvidence' | 'trigger' | 'invalidation' | 'keyLevelIds'>
  > = {
    bullish_continuation: {
      supportingEvidence: up.for,
      conflictingEvidence: up.against,
      trigger: `A close above ${H} (the last swing high), still above it when the window ends (${w}).`,
      invalidation: `A close below ${L} (the last swing low).`,
      keyLevelIds: ['swing-high', 'swing-low'],
    },
    bearish_continuation: {
      supportingEvidence: down.for,
      conflictingEvidence: down.against,
      trigger: `A close below ${L} (the last swing low), still below it when the window ends (${w}).`,
      invalidation: `A close above ${H} (the last swing high).`,
      keyLevelIds: ['swing-low', 'swing-high'],
    },
    bullish_reversal: {
      supportingEvidence: up.for,
      conflictingEvidence: up.against,
      trigger: `A close above ${H} (the last swing high), still above it when the window ends (${w}).`,
      invalidation: `A close below ${L} (the last swing low), which keeps the structure as it was.`,
      keyLevelIds: ['swing-high', 'swing-low'],
    },
    bearish_reversal: {
      supportingEvidence: down.for,
      conflictingEvidence: down.against,
      trigger: `A close below ${L} (the last swing low), still below it when the window ends (${w}).`,
      invalidation: `A close above ${H} (the last swing high), which keeps the structure as it was.`,
      keyLevelIds: ['swing-low', 'swing-high'],
    },
    range: {
      supportingEvidence: [
        ...(i.structure === 'ranging' ? ['Structure is ranging.'] : []),
        ...(i.volatility === 'low' ? ['Volatility is low against its recent baseline.'] : []),
        ...calm,
      ],
      conflictingEvidence: [
        ...(i.volatility === 'high' ? ['Volatility is high against its recent baseline.'] : []),
        ...loud,
      ],
      trigger: `Every close stays between ${L} and ${H} for the window (${w}).`,
      invalidation: `A close beyond ${L} or ${H}.`,
      keyLevelIds: ['swing-low', 'swing-high'],
    },
    failed_breakout: {
      supportingEvidence: failedHits,
      conflictingEvidence:
        i.engines.filter((e) => dirOf(e) !== 0).length >= 3 ? ['Most engines agree on one direction.'] : [],
      trigger: `A close beyond ${H} or ${L}, then the window ends back between them (${w}).`,
      invalidation: `The window ends beyond a level (a continuation or reversal), or no close goes beyond one.`,
      keyLevelIds: ['swing-high', 'swing-low'],
    },
  }

  const out: Scenario[] = SCENARIO_ORDER.map((id) => {
    const supported = detail[id].supportingEvidence.length > 0
    const ranked = rankOf(id)
    const rank = ranked === 'possible' && !supported ? 'less_likely' : ranked
    const ok = raw[id] !== null
    const first = detail[id].supportingEvidence[0]
    const against = detail[id].conflictingEvidence[0]
    const explanation = !ok
      ? `Not applicable: ${NOT_APPLICABLE[id]} (structure is ${i.structure}).`
      : `${SCENARIOS[id].name} is ${rank === 'favored' ? 'favored' : rank === 'possible' ? 'possible' : 'less likely'} on the ${i.bar} reading.` +
        (first ? ` For it: ${first}` : ' Nothing in the evidence supports it directly.') +
        (against ? ` Against it: ${against}` : '')
    return { id, qualitativeRank: rank, applicable: ok, explanation, ...detail[id] }
  })

  // most likely first; ties keep the definitions' order
  const score = (s: Scenario) => raw[s.id] ?? -Infinity
  return out.sort((a, b) => score(b) - score(a))
}
