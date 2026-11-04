import type { Bar, StatBar } from '@crypz/exchanges'
import type { WidgetKind } from '@/components/workspace/model'

// The contract of the Market Intelligence engine. Everything here is data: the engine computes it, the page renders
// it, and (later) a language model may only put words to it. Times are ms since the epoch, like the rest of the app.

export const HORIZONS = ['5m', '15m', '1H', '4H', '1D'] as const
export type Horizon = (typeof HORIZONS)[number]

/** How a horizon is read: the chart bar the analysis runs on, and how many of those bars make the outcome window. */
export type HorizonConfig = {
  bar: Bar
  /** The derivatives statistics bar (OKX publishes 5m, 15m, 1H, 4H and 1D; the horizon names one of them). */
  stat: StatBar
  /** Bars in the outcome window: `window × bar` is the horizon. */
  window: number
  /** Bars each side of a swing point. */
  swing: number
}

export type SignalState = 'bullish' | 'bearish' | 'mixed' | 'neutral' | 'unavailable'
export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unavailable'

export type ScenarioId =
  | 'bullish_continuation'
  | 'bearish_continuation'
  | 'bullish_reversal'
  | 'bearish_reversal'
  | 'range'
  | 'failed_breakout'

export type EngineId = 'structure' | 'liquidity' | 'flow' | 'positioning' | 'forced'

export type EvidenceItem = {
  id: string
  sourceWidget: WidgetKind
  state: SignalState
  summary: string
  /** When the data behind it was last received; null when there is none. */
  observedAt: number | null
  freshness: Freshness
  metric?: string
  value?: number | string
  unit?: string
  /** Counted in the engine's vote. Context items explain; they are never added again. */
  votes: boolean
}

/** One analytical engine: a group of correlated widgets that counts as one voice, not several. */
export type Engine = {
  id: EngineId
  title: string
  state: SignalState
  reason: string
  /** The widgets that show the evidence, for drill-down. */
  widgets: WidgetKind[]
  freshness: Freshness
  items: EvidenceItem[]
}

export type KeyLevel = {
  id: string
  type: 'support' | 'resistance' | 'poc' | 'vah' | 'val' | 'invalidation' | 'liquidity'
  price: number
  /** Plain-language origin, e.g. "Swing high on 15m". */
  source: string
  observedAt: number | null
  /** Resting orders can be cancelled before anything trades: shown as live liquidity, never as a guarantee. */
  live?: boolean
}

export type Scenario = {
  id: ScenarioId
  /** Only a validated, calibrated model fills this. The qualitative engine never does. */
  probability?: number
  qualitativeRank: 'favored' | 'possible' | 'less_likely'
  /** False when the scenario cannot happen from the current structure (no bullish trend to continue). */
  applicable: boolean
  explanation: string
  supportingEvidence: string[]
  conflictingEvidence: string[]
  trigger: string
  invalidation: string
  keyLevelIds: string[]
}

export type MarketState = {
  structure: 'bullish' | 'bearish' | 'ranging' | 'transitioning' | 'unclear'
  trend: 'higher_highs_higher_lows' | 'lower_highs_lower_lows' | 'range' | 'transition' | 'unclear'
  momentum: { state: 'strengthening' | 'weakening' | 'neutral' | 'unclear'; direction: 'up' | 'down' | null }
  volatility: { state: 'low' | 'normal' | 'high' | 'unclear'; ratio: number | null }
  liquidity: 'bid-heavy' | 'ask-heavy' | 'balanced' | 'thin' | 'unclear'
  derivatives: 'long-crowded' | 'short-crowded' | 'balanced' | 'unavailable'
}

export type SourceStatus = { id: string; label: string; freshness: Freshness; at: number | null }

export type MarketIntelligence = {
  instrument: string
  venue: 'OKX'
  marketType: 'perpetual' | 'spot'
  horizon: Horizon
  /** The bar the analysis ran on and the outcome window, so every claim names its timeframe. */
  bar: Bar
  windowBars: number
  asOf: number
  /** The price the levels and distances are measured from; null when there was nothing to analyse. */
  price: number | null
  dataQuality: {
    status: 'good' | 'degraded' | 'insufficient'
    staleSources: string[]
    missingSources: string[]
    sources: SourceStatus[]
  }
  marketState: MarketState
  engines: Engine[]
  evidence: EvidenceItem[]
  scenarios: Scenario[]
  keyLevels: KeyLevel[]
  model: {
    mode: 'qualitative' | 'probabilistic'
    version: string
    calibrated: boolean
    evaluationPeriod?: string
    sampleCount?: number
  }
}
