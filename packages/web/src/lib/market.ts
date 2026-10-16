import type { ExchangeId } from '@crypz/exchanges'

/**
 * Where every Market page and widget gets its public data (candles, tickers, later order book and trades).
 * Pinned to one venue on purpose: switching the market source is this one line, independent of which exchanges
 * a user has connected for their account pages.
 */
export const MARKET_EXCHANGE: ExchangeId = 'okx'
export const MARKET_EXCHANGE_NAME = 'OKX'
