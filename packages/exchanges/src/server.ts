import { binance } from './binance'
import { okx } from './okx'
import type { AccountSnapshot, Credentials, ExchangeAdapter, ExchangeId, ExchangeStatus, Position } from './types'

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

/** Fetch every connected exchange; one failing exchange never blanks the others. */
export async function loadPortfolio(
  connections: { exchange: ExchangeId; credentials: Credentials }[],
): Promise<Portfolio> {
  const errors: Portfolio['errors'] = []
  const positions: Position[] = []
  const accounts: AccountSnapshot[] = []

  await Promise.all(
    connections.map(async ({ exchange, credentials }) => {
      const a = getAdapter(exchange)
      const [pos, acc] = await Promise.allSettled([a.fetchClosedPositions(credentials), a.fetchAccount(credentials)])
      if (pos.status === 'fulfilled') positions.push(...pos.value)
      else errors.push({ exchange: a.name, message: String(pos.reason?.message ?? pos.reason) })
      if (acc.status === 'fulfilled') accounts.push(acc.value)
      else errors.push({ exchange: a.name, message: String(acc.reason?.message ?? acc.reason) })
    }),
  )

  positions.sort((a, b) => b.closedAt - a.closedAt)
  const connected = new Set(connections.map((c) => c.exchange))
  return {
    exchanges: adapters.map((a) => ({ id: a.id, name: a.name, configured: connected.has(a.id) })),
    positions,
    accounts,
    errors,
    fetchedAt: Date.now(),
  }
}
