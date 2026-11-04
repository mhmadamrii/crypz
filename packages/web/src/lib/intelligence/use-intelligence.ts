import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bookState } from '@/lib/book'
import { MARKET_EXCHANGE } from '@/lib/market'
import { useBook, useConnection, useFunding, useLiquidationFeed, useTicker, useTrades } from '@/lib/okx-ws'
import {
  instrumentQuery,
  latestCandlesQuery,
  liquidationsQuery,
  longShortQuery,
  openInterestQuery,
  premiumQuery,
  takerFlowQuery,
} from '@/lib/queries'
import { useNow } from '@/components/workspace/kit'
import { analyze, tagFor, type AnalysisInput } from './analyze'
import { HORIZON_CONFIG } from './horizons'
import type { Horizon, MarketIntelligence } from './types'

/**
 * The analysis for one instrument and horizon, from the same queries and WebSocket stores the widgets read, so the
 * page opens no connection of its own. It re-runs as data arrives and once a second as feeds age.
 *
 * A pushed feed (funding, the tape, liquidations) has no receive time, so it counts as current exactly while the
 * socket is live and as unavailable while it is not; a polled series is current by when its query last succeeded.
 */
export function useIntelligence(symbol: string, horizon: Horizon): { analysis: MarketIntelligence; loading: boolean } {
  const cfg = HORIZON_CONFIG[horizon]
  const ex = MARKET_EXCHANGE
  const tick = useNow()
  const conn = useConnection()

  const candles = useQuery(latestCandlesQuery(ex, symbol, cfg.bar))
  const taker = useQuery(takerFlowQuery(ex, symbol, cfg.stat))
  const oi = useQuery(openInterestQuery(ex, symbol, cfg.stat))
  const ls = useQuery(longShortQuery(ex, symbol, cfg.stat, 'accounts'))
  const premium = useQuery(premiumQuery(ex, symbol))
  const history = useQuery(liquidationsQuery(ex, symbol))
  const spec = useQuery(instrumentQuery(symbol))
  const book = useBook(symbol)
  const last = useTicker(symbol)
  const funding = useFunding(symbol)
  const trades = useTrades(symbol)
  const feed = useLiquidationFeed()

  const analysis = useMemo(() => {
    const now = Date.now()
    const live = conn.status === 'live'
    const pushed = <T>(data: T | null, tag: string) => ({
      data: live ? data : null,
      at: live && data !== null ? now : null,
      tag,
    })
    const stat = tagFor.stat(symbol, horizon)
    const sym = tagFor.live(symbol)

    // forced closes: the seed from REST plus what has arrived since, once each
    const ct = history.data?.contractValue ?? 0
    const seen = new Set<string>()
    const events: { time: number; side: 'long' | 'short'; usd: number }[] = []
    if (history.data)
      for (const e of [...feed.filter((x) => x.instId === symbol), ...history.data.events]) {
        const key = `${e.time}:${e.side}:${e.price}:${e.size}`
        if (seen.has(key)) continue
        seen.add(key)
        events.push({ time: e.time, side: e.side, usd: e.size * ct * e.price })
      }

    const price = last ? Number(last.last) : NaN
    const input: AnalysisInput = {
      symbol,
      horizon,
      now,
      candles: {
        data: candles.data ?? null,
        at: candles.data ? candles.dataUpdatedAt : null,
        tag: tagFor.candles(symbol, horizon),
      },
      price: { data: Number.isFinite(price) ? price : null, at: last ? Number(last.ts) : null, tag: sym },
      book: {
        bids: book.bids,
        asks: book.asks,
        spec: spec.data ?? null,
        state: bookState(book, conn, now),
        at: book.at,
        tag: sym,
      },
      taker: { data: taker.data ?? null, at: taker.data ? taker.dataUpdatedAt : null, tag: stat },
      openInterest: { data: oi.data ?? null, at: oi.data ? oi.dataUpdatedAt : null, tag: stat },
      longShort: { data: ls.data ?? null, at: ls.data ? ls.dataUpdatedAt : null, tag: stat },
      premium: { data: premium.data ?? null, at: premium.data ? premium.dataUpdatedAt : null, tag: sym },
      funding: pushed(funding ? Number(funding.fundingRate) : null, sym),
      liquidations: history.data
        ? { data: events, at: live ? now : history.dataUpdatedAt, tag: sym }
        : { data: null, at: null, tag: sym },
      tape: pushed(trades.length ? trades.map((t) => ({ side: t.side, size: Number(t.sz) })) : null, sym),
    }
    return analyze(input)
    // `tick` re-runs it each second so feeds visibly age
  }, [
    symbol,
    horizon,
    tick,
    conn,
    candles.data,
    candles.dataUpdatedAt,
    taker.data,
    taker.dataUpdatedAt,
    oi.data,
    oi.dataUpdatedAt,
    ls.data,
    ls.dataUpdatedAt,
    premium.data,
    premium.dataUpdatedAt,
    history.data,
    history.dataUpdatedAt,
    spec.data,
    book,
    last,
    funding,
    trades,
    feed,
  ])

  return { analysis, loading: candles.isPending }
}
