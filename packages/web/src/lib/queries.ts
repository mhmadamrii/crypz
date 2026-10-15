import { infiniteQueryOptions, queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import type { Bar, ExchangeId } from '@crypz/exchanges'
import { getPortfolio } from '@/server/portfolio'
import { getCandles, getTicker } from '@/server/market'

// Every server read goes through these, so caching, polling and dedupe live in one place.

export const portfolioQuery = () =>
  queryOptions({
    queryKey: ['portfolio'],
    queryFn: () => getPortfolio(),
    staleTime: 60_000,
  })

export const tickerQuery = (exchange: ExchangeId, symbol: string) =>
  queryOptions({
    queryKey: ['ticker', exchange, symbol],
    queryFn: () => getTicker({ data: { exchange, symbol } }),
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

/** Portfolio for pages under the (main) layout, whose loader has already filled the cache. */
export const usePortfolio = () => useSuspenseQuery(portfolioQuery()).data
