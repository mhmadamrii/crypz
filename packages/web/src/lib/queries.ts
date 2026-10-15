import { infiniteQueryOptions, queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { BAR_MS, type Bar, type Candle, type ExchangeId } from '@crypz/exchanges'

const getCandles = ({ data: q }: { data: { exchange: ExchangeId; symbol: string; bar: Bar; before?: number } }) =>
  unwrap(
    api.market.candles.$get({
      query: { exchange: q.exchange, symbol: q.symbol, bar: q.bar, ...(q.before ? { before: String(q.before) } : {}) },
    }),
  )
import { api, unwrap } from './api'

// Every server read goes through these, so caching, polling and dedupe live in one place.

export const portfolioQuery = () =>
  queryOptions({
    queryKey: ['portfolio'],
    queryFn: () => unwrap(api.portfolio.$get({ query: {} })),
    staleTime: 60_000,
  })

export const tickerQuery = (exchange: ExchangeId, symbol: string) =>
  queryOptions({
    queryKey: ['ticker', exchange, symbol],
    queryFn: () => unwrap(api.market.ticker.$get({ query: { exchange, symbol } })),
    refetchInterval: 10_000,
  })

/** The newest bars, polled so the last candle stays live. */
export const latestCandlesQuery = (exchange: ExchangeId, symbol: string, bar: Bar) =>
  queryOptions({
    queryKey: ['candles', exchange, symbol, bar, 'latest'],
    queryFn: () => getCandles({ data: { exchange, symbol, bar } }),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

/**
 * Older history, paged backwards. `before` (ms) only seeds the first page; it stays out of the key
 * so the live poll sliding the latest window does not refetch history. Each page is oldest-first.
 */
export const olderCandlesQuery = (exchange: ExchangeId, symbol: string, bar: Bar, before: number | undefined) =>
  infiniteQueryOptions({
    queryKey: ['candles', exchange, symbol, bar, 'older'],
    queryFn: ({ pageParam }) => getCandles({ data: { exchange, symbol, bar, before: pageParam } }),
    initialPageParam: before ?? 0,
    getNextPageParam: (page) => (page.length ? page[0].time : undefined),
    enabled: before !== undefined,
    staleTime: Infinity, // closed candles never change
  })

const REPLAY_CHUNK = 100 // bars per history-candles call

/**
 * Candles for a replay starting at `from` (ms). Page 0 is ~200 bars of context ending on the start bar plus the
 * first chunk after it; later pages walk forward one chunk at a time. Closed candles never change.
 */
export const replayCandlesQuery = (exchange: ExchangeId, symbol: string, bar: Bar, from: number) =>
  infiniteQueryOptions({
    queryKey: ['replay', exchange, symbol, bar, from],
    queryFn: async ({ pageParam }): Promise<Candle[]> => {
      const get = (before: number) => getCandles({ data: { exchange, symbol, bar, before } })
      if (pageParam !== null) return get(pageParam)
      const recent = await get(from + 1)
      const [older, ahead] = await Promise.all([
        recent.length ? get(recent[0].time) : [],
        get(from + (REPLAY_CHUNK + 1) * BAR_MS[bar]),
      ])
      return [...older, ...recent, ...ahead.filter((k) => k.time > from)]
    },
    initialPageParam: null as number | null,
    getNextPageParam: (page) => {
      const last = page[page.length - 1]?.time
      if (last === undefined || last + 2 * BAR_MS[bar] > Date.now()) return undefined
      return last + (REPLAY_CHUNK + 1) * BAR_MS[bar]
    },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })

export const connectionsQuery = () =>
  queryOptions({
    queryKey: ['connections'],
    queryFn: () => unwrap(api.connections.$get()),
  })

/** Portfolio for pages under the (main) layout, whose loader has already filled the cache. */
export const usePortfolio = () => useSuspenseQuery(portfolioQuery()).data

/** Instruments you have traded, most-traded first. */
export function useTradedSymbols() {
  const { positions } = usePortfolio()
  return useMemo(() => {
    const n = new Map<string, number>()
    for (const p of positions) n.set(p.symbol, (n.get(p.symbol) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [positions])
}
