import type { Candle } from '@crypz/exchanges'
import type { Bias, Side } from '@/lib/indicators/bias'
import type { Liquidity } from '@/lib/indicators/liquidity'
import type { Zone } from '@/lib/indicators/order-blocks'
import type { BiasFrame } from '@/lib/indicators/store'
import type { Structure } from '@/lib/indicators/structure'

// A strategy is a named checklist. Each rule reads the revealed candles through one shared context and says whether
// it is met right now; the strategy is ready when every rule is. Rules use their own fixed parameters, not the
// indicator menu's, so toggling an overlay never changes what the checklist says.

/** The levels a ready setup would be traded at. */
export type Plan = { side: Side; entry: number; stop: number; target: number; reward: number }

export type Check = { met: boolean; detail: string; plan?: Plan }

export type Params = {
  /** Bars each side of a swing. */
  swing: number
  /** Equal highs or lows tolerance, in ATRs. */
  tolerance: number
  /** Touches a level needs to count for a sweep: 1 is any swing, 2 a pool of equal highs or lows. */
  minTouches: number
  /** Order block impulse, in ATRs (always with an imbalance). */
  impulse: number
}

export type Ctx = {
  params: Params
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

export type Rule = {
  id: string
  label: string
  /** What it checks, in a sentence, for the strategies page. */
  hint: string
  check: (c: Ctx) => Check
}

export type Strategy = {
  id: string
  name: string
  summary: string
  /** The higher timeframe the bias is read from. */
  biasFrame: BiasFrame
  params: Params
  rules: Rule[]
}

export type Evaluation = {
  strategy: Strategy
  side: Side | null
  results: { id: string; label: string; met: boolean; detail: string }[]
  met: number
  ready: boolean
  plan: Plan | null
}
