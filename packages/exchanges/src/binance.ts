import type { ExchangeAdapter } from './types'

// Placeholder so the UI and registry already treat Binance as a first-class exchange.
export const binance: ExchangeAdapter = {
  id: 'binance',
  name: 'Binance',
  isConfigured: () => false,
  fetchClosedPositions: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchAccount: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchCandles: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchTicker: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  tradeUrl: (symbol) => `https://www.binance.com/en/futures/${symbol.replace(/-/g, '')}`,
}
