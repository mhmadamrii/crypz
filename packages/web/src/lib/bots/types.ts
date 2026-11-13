import type { Bar } from '@crypz/exchanges'

// EMA pullback scalping: one configuration object holds every number that can change a signal or a result, so a run
// is reproducible from its config and candles alone. Nothing here talks to an exchange.

export type Side = 'long' | 'short'

export type BotConfig = {
  symbol: string
  entryBar: Bar
  trendBar: Bar
  /** Inclusive start and exclusive end of the traded window (ms, UTC). Candles before `startMs` only warm indicators up. */
  startMs: number
  endMs: number
  /** USDT. */
  initialEquity: number
  /** % of current equity risked between entry and stop. */
  riskPct: number
  /** Reward multiple R in 1:R. */
  rr: number
  /** Fraction of notional charged on each side (0.0005 = 0.05%). Every fill is taken as a market (taker) fill. */
  feeRate: number
  /** Adverse slippage per fill in basis points (market fills only; a take-profit limit fill gets none). */
  slippageBps: number
  /** A trade whose notional would exceed equity times this is skipped: there is no margin model beyond this cap. */
  maxLeverage: number
  emaFast: number
  emaMid: number
  emaSlow: number
  rsiPeriod: number
  rsiTrigger: number
  atrPeriod: number
  volumePeriod: number
  /** Candles (signal candle included) whose extreme sets the stop. */
  swingLookback: number
  /** ATRs added beyond the swing extreme. */
  slAtrBuffer: number
  /** How far past the slow pullback EMA (ATRs) the signal candle's extreme may reach. */
  pullbackAtr: number
  /** A stop closer than this many ATRs to the entry is too small to trade. */
  minStopAtr: number
}

export const DEFAULT_CONFIG: Omit<BotConfig, 'symbol' | 'startMs' | 'endMs'> = {
  entryBar: '5m',
  trendBar: '15m',
  initialEquity: 1000,
  riskPct: 1,
  rr: 3,
  // OKX's standard USDT-swap taker rate. It is not read from your account: change it to your own tier.
  feeRate: 0.0005,
  slippageBps: 0,
  maxLeverage: 10,
  emaFast: 20,
  emaMid: 50,
  emaSlow: 200,
  rsiPeriod: 14,
  rsiTrigger: 50,
  atrPeriod: 14,
  volumePeriod: 20,
  swingLookback: 5,
  slAtrBuffer: 0.1,
  pullbackAtr: 1,
  minStopAtr: 0.2,
}

/** Contract rules the position size must respect (see `InstrumentSpec` in @crypz/exchanges). */
export type Spec = { ctVal: number; lotSz: number; minSz: number; tickSz: number }

export type ExitReason = 'TP' | 'SL' | 'end_of_data'

export type BotTrade = {
  id: number
  side: Side
  /** Close time of the signal candle, then the open of the candle the order filled on. */
  signalTime: number
  entryTime: number
  entry: number
  stop: number
  target: number
  exitTime: number
  exit: number
  reason: ExitReason
  /** Contracts, and the same in base coins. */
  contracts: number
  qtyBase: number
  notional: number
  /** Equity at entry times the risk %: the denominator of R. */
  riskBudget: number
  grossPnl: number
  fees: number
  /** What slippage cost in USDT (already inside the fill prices, shown on its own). */
  slippageCost: number
  netPnl: number
  /** Net PnL over the risk budget. */
  r: number
  equityBefore: number
  equityAfter: number
}

export type Skipped = { time: number; side: Side; reason: string }

export type EquityPoint = { time: number; equity: number }

export type BacktestResult = {
  config: BotConfig
  trades: BotTrade[]
  skipped: Skipped[]
  /** Closed-trade equity: it steps when a trade closes and does not mark the open position to market. */
  equity: EquityPoint[]
  coverage: {
    entryCandles: number
    trendCandles: number
    firstTime: number
    lastTime: number
    /** Bars missing inside the data (gaps), per timeframe. Never filled in. */
    missingEntry: number
    missingTrend: number
    duplicatesDropped: number
  }
  warnings: string[]
}
