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

export const BARS = ['15m', '1H', '4H', '1D'] as const
export type Bar = (typeof BARS)[number]

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }

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
