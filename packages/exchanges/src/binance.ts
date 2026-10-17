import type { ExchangeAdapter } from './types'

// Placeholder so the UI and registry already treat Binance as a first-class exchange.
export const binance: ExchangeAdapter = {
  id: 'binance',
  name: 'Binance',
  available: false,
  needsPassphrase: false,
  verifyKey: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
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
  fetchTakerFlow: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchOpenInterest: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchLongShort: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchLiquidations: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  fetchPremium: async () => {
    throw new Error('Binance adapter not implemented yet')
  },
  tradeUrl: (symbol) => `https://www.binance.com/en/futures/${symbol.replace(/-/g, '')}`,
}
