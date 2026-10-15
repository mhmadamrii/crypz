import { binance } from './binance'
import { okx } from './okx'
import type { AccountSnapshot, ExchangeAdapter, ExchangeId, ExchangeStatus, Position } from './types'

export const adapters: ExchangeAdapter[] = [okx, binance]

export function getAdapter(id: ExchangeId): ExchangeAdapter {
  const a = adapters.find((x) => x.id === id)
  if (!a) throw new Error(`Unknown exchange ${id}`)
  return a
}

export type Portfolio = {
  exchanges: ExchangeStatus[]
  positions: Position[]
  accounts: AccountSnapshot[]
  errors: { exchange: string; message: string }[]
  fetchedAt: number
}

/** Fetch every configured exchange; one failing exchange never blanks the others. */
export async function loadPortfolio(): Promise<Portfolio> {
  const configured = adapters.filter((a) => a.isConfigured())
  const errors: Portfolio['errors'] = []
  const positions: Position[] = []
  const accounts: AccountSnapshot[] = []

  await Promise.all(
    configured.map(async (a) => {
      const [pos, acc] = await Promise.allSettled([a.fetchClosedPositions(), a.fetchAccount()])
      if (pos.status === 'fulfilled') positions.push(...pos.value)
      else errors.push({ exchange: a.name, message: String(pos.reason?.message ?? pos.reason) })
      if (acc.status === 'fulfilled') accounts.push(acc.value)
      else errors.push({ exchange: a.name, message: String(acc.reason?.message ?? acc.reason) })
    }),
  )

  positions.sort((a, b) => b.closedAt - a.closedAt)
  return {
    exchanges: adapters.map((a) => ({ id: a.id, name: a.name, configured: a.isConfigured() })),
    positions,
    accounts,
    errors,
    fetchedAt: Date.now(),
  }
}
