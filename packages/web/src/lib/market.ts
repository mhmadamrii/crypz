import { BARS, type Bar, type ExchangeId } from '@crypz/exchanges'

/**
 * Where every Market page and widget gets its public data (candles, tickers, later order book and trades).
 * Pinned to one venue on purpose: switching the market source is this one line, independent of which exchanges
 * a user has connected for their account pages.
 */
export const MARKET_EXCHANGE: ExchangeId = 'okx'
export const MARKET_EXCHANGE_NAME = 'OKX'

export const DEFAULT_SYMBOL = 'BTC-USDT-SWAP'
export const DEFAULT_BAR: Bar = '1H'

/** The `symbol` and `bar` search params every Market page shares, checked; anything else becomes undefined. */
export const symbolBarSearch = (s: Record<string, unknown>): { symbol?: string; bar?: Bar } => ({
  symbol: typeof s.symbol === 'string' ? s.symbol.toUpperCase() : undefined,
  bar: typeof s.bar === 'string' && (BARS as readonly string[]).includes(s.bar) ? (s.bar as Bar) : undefined,
})
