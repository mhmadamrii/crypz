import { infiniteQueryOptions, keepPreviousData, queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { BAR_MS, type Bar, type Candle, type ExchangeId } from '@crypz/exchanges'

const getCandles = ({ data: q }: { data: { exchange: ExchangeId; symbol: string; bar: Bar; before?: number } }) =>
  unwrap(
    api.market.candles.$get({
      query: { exchange: q.exchange, symbol: q.symbol, bar: q.bar, ...(q.before ? { before: String(q.before) } : {}) },
    }),
  )
import { api, unwrap } from './api'
import { DEFAULT_STATE } from '@/components/workspace/model'

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
        // step from the last candle's open, not from `from`: `from` sits mid-bar, and the exchange returns the
        // 100 bars before the cut, so an unaligned cut would skip the first bar after the context
        get((recent.at(-1)?.time ?? from) + (REPLAY_CHUNK + 1) * BAR_MS[bar]),
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
    // switching interval keeps the old candles on screen (blurred) until the new ones land
    placeholderData: keepPreviousData,
  })

export const connectionsQuery = () =>
  queryOptions({
    queryKey: ['connections'],
    queryFn: () => unwrap(api.connections.$get()),
  })

/** Finer candles inside a forming replay bar, [open, before). History never changes, so cache it forever. */
export const replayFineQuery = (exchange: ExchangeId, symbol: string, fine: Bar, open: number, before: number) =>
  queryOptions({
    queryKey: ['replay-fine', exchange, symbol, fine, open, before],
    queryFn: async () => {
      const out: Candle[] = []
      let cut = before
      // at most 300 candles (fineBar's budget), 100 per call
      for (let page = 0; page < 3; page++) {
        const got = await getCandles({ data: { exchange, symbol, bar: fine, before: cut } })
        out.unshift(...got)
        if (!got.length || got[0].time <= open) break
        cut = got[0].time
      }
      return out.filter((k) => k.time >= open)
    },
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })

/** Portfolio for pages under the (main) layout, whose loader has already filled the cache. */
export const usePortfolio = () => useSuspenseQuery(portfolioQuery()).data

// Liquid OKX perpetuals, so someone without trade history (or a key) still has a market to pick.
const POPULAR = [
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'DOGE',
  'BNB',
  'ADA',
  'AVAX',
  'LINK',
  'SUI',
  'LTC',
  'DOT',
  'TRX',
  'HYPE',
  'PEPE',
  'ZEC',
].map((b) => `${b}-USDT-SWAP`)

/** Instruments for the pickers: the ones you traded (most-traded first), then popular perpetuals. */
export function useInstruments() {
  const { positions } = usePortfolio()
  return useMemo(() => {
    const n = new Map<string, number>()
    for (const p of positions) n.set(p.symbol, (n.get(p.symbol) ?? 0) + 1)
    const traded = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
    return [...traded, ...POPULAR.filter((s) => !n.has(s))]
  }, [positions])
}

/** The portfolio narrowed to one exchange, for the Account pages (`/$exchange/...`). */
export function useExchangePortfolio(exchange: ExchangeId) {
  const data = usePortfolio()
  return useMemo(() => {
    const status = data.exchanges.find((e) => e.id === exchange)
    return {
      ...data,
      exchange: status,
      positions: data.positions.filter((p) => p.exchange === exchange),
      accounts: data.accounts.filter((a) => a.exchange === exchange),
      errors: data.errors.filter((e) => e.exchange === status?.name),
    }
  }, [data, exchange])
}

export const workspacesQuery = () =>
  queryOptions({
    queryKey: ['workspaces'],
    // first visit: everyone starts with one workspace, created here rather than in an effect
    queryFn: async () => {
      const list = await unwrap(api.workspaces.$get())
      if (list.length) return list
      const created = await unwrap(api.workspaces.$post({ json: { name: 'Main', state: DEFAULT_STATE } }))
      return [created]
    },
    staleTime: Infinity, // this tab is the only writer; it updates the cache itself
  })
