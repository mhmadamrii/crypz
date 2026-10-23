export type Direction = 'long' | 'short'

export type PositionSizeInput = {
  /** In `currency`. */
  equity: number
  /** What the equity is held in. Prices, and every amount in the result, are in USDT (or USD): IDR converts at `idrRate`. */
  currency: 'USDT' | 'USD' | 'IDR'
  riskPct: number
  direction: Direction
  entry: number
  stop: number
  /** Reward multiple R in 1:R. */
  rr: number
  /** Manual IDR per 1 USDT/USD. Required when sizing in IDR; otherwise 0 or empty hides the rupiah lines. */
  idrRate: number
}

export type PositionSizeResult = {
  /** The equity in USDT/USD: the input as is, or converted from IDR. */
  equity: number
  riskAmount: number
  riskPerUnit: number
  size: number
  value: number
  pctOfEquity: number
  /** Smallest whole leverage that fits the position in equity. */
  minLeverage: number
  takeProfit: number
  riskDistancePct: number
  rewardDistancePct: number
  maxLoss: number
  potentialProfit: number
}

export type FieldErrors = Partial<Record<keyof PositionSizeInput, string>>

export const DEFAULT_INPUT: PositionSizeInput = {
  equity: 10_000,
  currency: 'USDT',
  riskPct: 2,
  direction: 'long',
  entry: 7000,
  stop: 6800,
  rr: 3,
  idrRate: 16_000,
}

export function validate(i: PositionSizeInput): FieldErrors {
  const e: FieldErrors = {}
  if (!(i.equity > 0)) e.equity = 'Enter your trading capital.'
  if (!(i.riskPct > 0)) e.riskPct = 'Risk must be above 0%.'
  else if (i.riskPct > 100) e.riskPct = 'Risk cannot exceed 100% of equity.'
  if (!(i.entry > 0)) e.entry = 'Enter an entry price.'
  if (!(i.stop > 0)) e.stop = 'Enter a stop loss price.'
  else if (i.entry > 0 && i.direction === 'long' && i.stop >= i.entry) e.stop = 'For a long, stop must be below entry.'
  else if (i.entry > 0 && i.direction === 'short' && i.stop <= i.entry)
    e.stop = 'For a short, stop must be above entry.'
  if (!(i.rr > 0)) e.rr = 'Reward multiple must be above 0.'
  else if (!e.stop && !e.entry && i.direction === 'short' && i.entry - (i.stop - i.entry) * i.rr <= 0)
    e.rr = 'Target would fall to zero or below. Lower the multiple.'
  if (i.idrRate < 0) e.idrRate = 'Rate cannot be negative.'
  else if (i.currency === 'IDR' && !(i.idrRate > 0)) e.idrRate = 'Enter the rate to size from rupiah.'
  return e
}

export function calculate(i: PositionSizeInput): PositionSizeResult | null {
  if (Object.keys(validate(i)).length) return null
  const equity = i.currency === 'IDR' ? i.equity / i.idrRate : i.equity
  const riskAmount = equity * (i.riskPct / 100)
  const riskPerUnit = i.direction === 'long' ? i.entry - i.stop : i.stop - i.entry
  const size = riskAmount / riskPerUnit
  const value = size * i.entry
  const pctOfEquity = (value / equity) * 100
  const takeProfit = i.direction === 'long' ? i.entry + riskPerUnit * i.rr : i.entry - riskPerUnit * i.rr
  return {
    equity,
    riskAmount,
    riskPerUnit,
    size,
    value,
    pctOfEquity,
    minLeverage: Math.max(1, Math.ceil(pctOfEquity / 100)),
    takeProfit,
    riskDistancePct: (riskPerUnit / i.entry) * 100,
    rewardDistancePct: ((riskPerUnit * i.rr) / i.entry) * 100,
    maxLoss: -riskAmount,
    potentialProfit: riskAmount * i.rr,
  }
}
