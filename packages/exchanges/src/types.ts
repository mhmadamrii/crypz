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

export interface ExchangeAdapter {
  id: ExchangeId
  name: string
  isConfigured(): boolean
  fetchClosedPositions(): Promise<Position[]>
  fetchAccount(): Promise<AccountSnapshot>
}
