export type ExchangeId = 'okx' | 'binance'

/** A closed position, normalized across exchanges. Money values are in the settle currency (USDT). */
export type Position = {
  id: string
  exchange: ExchangeId
  symbol: string // exchange-native, e.g. BTC-USDT-SWAP
  base: string // BTC
  side: 'long' | 'short'
  leverage: number
  marginMode: string
  entryPrice: number
  exitPrice: number
  size: number
  pnl: number
  fee: number
  funding: number
  realizedPnl: number
  pnlRatio: number
  openedAt: number // ms
  closedAt: number // ms
  tradeUrl: string
}

export type AccountSnapshot = {
  exchange: ExchangeId
  currency: string
  totalEquity: number
  /** Equity per account bucket, e.g. trading / funding / earn. */
  buckets: { name: string; value: number }[]
  unrealizedPnl: number | null
}

export type ExchangeStatus = {
  id: ExchangeId
  name: string
  /** The user has at least one key connected for it. */
  configured: boolean
}

/** Every candle interval the app can draw, shortest first. */
export const BARS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1H',
  '2H',
  '4H',
  '6H',
  '12H',
  '1D',
  '2D',
  '3D',
  '1W',
  '1M',
  '3M',
] as const
export type Bar = (typeof BARS)[number]

const MIN = 6e4
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Length of one bar in ms (months approximated as 30 days). */
export const BAR_MS: Record<Bar, number> = {
  '1m': MIN,
  '3m': 3 * MIN,
  '5m': 5 * MIN,
  '15m': 15 * MIN,
  '30m': 30 * MIN,
  '1H': HOUR,
  '2H': 2 * HOUR,
  '4H': 4 * HOUR,
  '6H': 6 * HOUR,
  '12H': 12 * HOUR,
  '1D': DAY,
  '2D': 2 * DAY,
  '3D': 3 * DAY,
  '1W': 7 * DAY,
  '1M': 30 * DAY,
  '3M': 91 * DAY,
}

/** `volume` is in contracts for swaps; candles built in the browser (live, replay) leave it out. */
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume?: number }

/** Taker buy and sell volume over one period, in contracts. */
export type TakerFlow = { time: number; buy: number; sell: number }

/** Periods the exchange's trading-statistics series (taker flow, open interest, long/short) come in. */
export const STAT_BARS = ['5m', '15m', '1H', '4H', '1D'] as const
export type StatBar = (typeof STAT_BARS)[number]

/** Open interest at the end of a period: contracts and their USD value. */
export type OpenInterest = { time: number; contracts: number; usd: number }

/** Whose long/short split: all accounts, the top traders' accounts, or the top traders' position sizes. */
export const LONG_SHORT_KINDS = ['accounts', 'top-accounts', 'top-positions'] as const
export type LongShortKind = (typeof LONG_SHORT_KINDS)[number]
export type LongShort = { time: number; ratio: number }

/** A forced close. `side` is the position that was liquidated; `size` is in contracts. */
export type Liquidation = { time: number; side: 'long' | 'short'; price: number; size: number }
/** Recent liquidations, newest first, with what one contract is worth in the base coin. */
export type Liquidations = { contractValue: number; events: Liquidation[] }

/** Perpetual premium over the index, as a fraction (−0.0004 = 4bp under). */
export type Premium = { time: number; premium: number }

export type Ticker = {
  symbol: string
  last: number
  open24h: number
  high24h: number
  low24h: number
  volume24h: number
}

/** A user's API key for one exchange, decrypted only for the duration of a request. */
export type Credentials = { apiKey: string; secret: string; passphrase?: string; demo?: boolean }

/** What the exchange says a key may do. */
export type KeyCheck = { permissions: string[]; readOnly: boolean; account?: string }

export interface ExchangeAdapter {
  id: ExchangeId
  name: string
  /** Whether this build can talk to the exchange yet. */
  available: boolean
  needsPassphrase: boolean
  verifyKey(c: Credentials): Promise<KeyCheck>
  fetchClosedPositions(c: Credentials): Promise<Position[]>
  fetchAccount(c: Credentials): Promise<AccountSnapshot>
  /** Public market data, oldest first. `before` (ms) pages back into history. */
  fetchCandles(symbol: string, bar: Bar, before?: number): Promise<Candle[]>
  fetchTicker(symbol: string): Promise<Ticker>
  /** Taker buy/sell volume per period, oldest first; the newest period is still forming. */
  fetchTakerFlow(symbol: string, bar: StatBar): Promise<TakerFlow[]>
  /** Open interest per period, oldest first. */
  fetchOpenInterest(symbol: string, bar: StatBar): Promise<OpenInterest[]>
  /** Long/short ratio per period, oldest first. */
  fetchLongShort(symbol: string, bar: StatBar, kind: LongShortKind): Promise<LongShort[]>
  fetchLiquidations(symbol: string): Promise<Liquidations>
  /** Premium history over roughly the last hour and a half, oldest first. */
  fetchPremium(symbol: string): Promise<Premium[]>
  tradeUrl(symbol: string): string
}
