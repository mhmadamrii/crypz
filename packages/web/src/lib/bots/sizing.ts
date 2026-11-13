import type { Side, Spec } from './types'

const clean = (n: number) => Number(n.toPrecision(12))

/** Snaps `price` to the price step, rounding down or up. */
export function snap(price: number, tick: number, dir: 'down' | 'up') {
  if (!(tick > 0)) return price
  const n = price / tick
  return clean((dir === 'down' ? Math.floor(n + 1e-9) : Math.ceil(n - 1e-9)) * tick)
}

/** Rounds `contracts` down to the lot step. */
export const floorLot = (contracts: number, lot: number) =>
  lot > 0 ? clean(Math.floor(contracts / lot + 1e-9) * lot) : contracts

export type Sized =
  { ok: true; contracts: number; qtyBase: number; notional: number; riskBudget: number } | { ok: false; reason: string }

/**
 * Contracts that lose `riskPct` % of `equity` if the stop fills at `stop`, floored to the lot size. Rounding down
 * keeps the nominal risk at or under the budget. Skips when the order would be under the exchange minimum or its
 * notional above `maxLeverage` times equity.
 */
export function sizePosition(a: {
  equity: number
  riskPct: number
  entry: number
  stop: number
  spec: Spec
  maxLeverage: number
}): Sized {
  const riskBudget = a.equity * (a.riskPct / 100)
  const dist = Math.abs(a.entry - a.stop)
  if (!(dist > 0) || !(a.spec.ctVal > 0)) return { ok: false, reason: 'no stop distance' }
  const contracts = floorLot(riskBudget / dist / a.spec.ctVal, a.spec.lotSz)
  if (contracts < a.spec.minSz) return { ok: false, reason: 'below the exchange minimum order size' }
  const qtyBase = contracts * a.spec.ctVal
  const notional = qtyBase * a.entry
  if (notional > a.equity * a.maxLeverage) return { ok: false, reason: `needs more than ${a.maxLeverage}× leverage` }
  return { ok: true, contracts, qtyBase, notional, riskBudget }
}

/** Stop and target for an entry at `entry`, snapped so the stop sits further out and the target a little closer. */
export function levels(side: Side, entry: number, rawStop: number, rr: number, tick: number) {
  const stop = snap(rawStop, tick, side === 'long' ? 'down' : 'up')
  const dist = Math.abs(entry - stop)
  const raw = side === 'long' ? entry + dist * rr : entry - dist * rr
  return { stop, target: snap(raw, tick, side === 'long' ? 'down' : 'up') }
}
