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

export type Candle = { time: number; open: number; high: number; low: number; close: number }

export type Ticker = {
  symbol: string
  last: number
  open24h: number
  high24h: number
  low24h: number
  volume24h: number
}

export interface ExchangeAdapter {
  id: ExchangeId
  name: string
  isConfigured(): boolean
  fetchClosedPositions(): Promise<Position[]>
  fetchAccount(): Promise<AccountSnapshot>
  /** Public market data, oldest first. `before` (ms) pages back into history. */
  fetchCandles(symbol: string, bar: Bar, before?: number): Promise<Candle[]>
  fetchTicker(symbol: string): Promise<Ticker>
  tradeUrl(symbol: string): string
}
