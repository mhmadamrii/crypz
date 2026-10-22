import type { Bar, Candle } from '@crypz/exchanges'
import type { Side } from '@/lib/indicators/bias'

// A strategy is a named checklist. Each rule reads the revealed candles and says whether it is met right now; the
// strategy is ready when every rule is. A strategy names the timeframes it reads (`frames`) and gets their closed
// candles whatever interval the chart is on, so the checklist says the same on 30m as on 5m. Rules use their own
// fixed parameters, not the indicator menu's, so toggling an overlay never changes what the checklist says.

/** The levels a ready setup would be traded at. */
export type Plan = { side: Side; entry: number; stop: number; target: number; reward: number }

export type Check = { met: boolean; detail: string; plan?: Plan }

/** The most timeframes one strategy can read besides the chart's own (the replay loads each in its own slot). */
export const MAX_FRAMES = 3

/** Closed candles by timeframe, up to the replay clock. */
export type Series = Partial<Record<Bar, Candle[]>>

export type Input = {
  /** The chart's candles as revealed, the forming one included. */
  candles: Candle[]
  barLabel: Bar
  /** Closed candles of each of the strategy's frames (the chart's own, when it is one). */
  series: Series
}

export type Row = Check & { id: string; label: string }

export type Run = { side: Side | null; results: Row[] }

export type Strategy = {
  id: string
  name: string
  summary: string
  /** Timeframes it reads, at most MAX_FRAMES, in the order the strategies page lists them. */
  frames: Bar[]
  /** Its fixed parameters in one line, for the strategies page. */
  settings: string
  /** The rules in order, for the strategies page. */
  rules: { id: string; label: string; hint: string }[]
  run: (input: Input) => Run
}

export type Evaluation = {
  strategy: Strategy
  side: Side | null
  results: Row[]
  met: number
  ready: boolean
  plan: Plan | null
  /** Frames whose candles have not caught up with the replay clock yet; the checklist waits for them. */
  pending: Bar[]
}
