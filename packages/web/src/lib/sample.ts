import type { Position } from '@crypz/exchanges'

// Deterministic synthetic history for the landing page. Never shown as real data.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const ASSETS: [string, number, number][] = [
  // base, price, bias (edge per trade)
  ['BTC', 82000, 0.25],
  ['ETH', 2500, -0.1],
  ['SOL', 115, -0.35],
  ['DOGE', 0.088, -0.2],
  ['ZEC', 1300, 0.3],
  ['HYPE', 54, -0.15],
]

export function samplePositions(n = 288): Position[] {
  const r = rng(42)
  const start = Date.UTC(2026, 6, 15)
  return Array.from({ length: n }, (_, i) => {
    const [base, price, bias] = ASSETS[Math.floor(r() * ASSETS.length)]
    const side = r() > 0.5 ? 'long' : 'short'
    const openedAt = start + i * 7.5 * 36e5 + r() * 3e6
    const hold = (5 + r() * r() * 600) * 60e3
    const realized = (r() - 0.55 + bias * 0.4) * 4
    const entry = price * (1 + (r() - 0.5) * 0.2)
    return {
      id: `sample-${i}`,
      exchange: 'okx',
      symbol: `${base}-USDT-SWAP`,
      base,
      side,
      leverage: 10,
      marginMode: 'isolated',
      entryPrice: entry,
      exitPrice: entry * (1 + realized / 200),
      size: 1,
      pnl: realized + 0.12,
      fee: -0.12,
      funding: 0,
      realizedPnl: realized,
      pnlRatio: realized / 15,
      openedAt,
      closedAt: openedAt + hold,
      tradeUrl: '#',
    } satisfies Position
  })
}
