import { useMemo } from 'react'
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { BAR_MS, type Bar, type Candle, type ExchangeId } from '@crypz/exchanges'
import { FIRST_HISTORY_DAY, minutesOf, okxDays, type Minute } from '@/lib/footprint'
import { useIndicators } from '@/lib/indicators/store'
import { footprintDayQuery, getFootprintDay } from '@/lib/queries'
import { FOOTPRINT_MAX_BAR, type FootprintData } from './footprint-layer'

// Which OKX days the replay footprint needs and how far along each is. The days are those holding the last 150
// revealed bars (at most three), so a long session only ever asks for what is on screen.

type DayResult = Awaited<ReturnType<typeof getFootprintDay>>
export type DayState =
  | { day: string; status: 'pending' | 'ready' }
  | { day: string; status: 'unpublished'; at: number }
  | { day: string; status: 'failed'; error: string }

const LOOKBACK = 150
const MAX_DAYS = 3

// decoding a day is a few milliseconds; keep it per response so polling the others does not redo it
const decoded = new WeakMap<object, Map<number, Minute>>()

function combine(days: string[]) {
  return (results: UseQueryResult<DayResult>[]) => {
    const minutes = new Map<number, Minute>()
    let step = 0
    const states: DayState[] = results.map((r, i): DayState => {
      const d = r.data
      if (!d)
        return r.isError
          ? { day: days[i], status: 'failed', error: r.error.message }
          : { day: days[i], status: 'pending' }
      if (d.status === 'ready') {
        let m = decoded.get(d)
        if (!m) decoded.set(d, (m = minutesOf(d.bars, d.step)))
        for (const [t, v] of m) minutes.set(t, v)
        step = Math.max(step, d.step)
      }
      return d
    })
    return { minutes, step, states }
  }
}

export function useFootprintHistory(exchange: ExchangeId, symbol: string, bar: Bar, now: number, revealed: Candle[]) {
  const s = useIndicators().footprint
  const client = useQueryClient()
  const okx = exchange === 'okx'
  const on = s.on && okx && BAR_MS[bar] <= FOOTPRINT_MAX_BAR
  const from = revealed[Math.max(0, revealed.length - LOOKBACK)]?.time ?? now
  const days =
    on && revealed.length
      ? okxDays(from, now)
          .filter((d) => d >= FIRST_HISTORY_DAY)
          .slice(-MAX_DAYS)
      : []
  // a stable combine keeps the merged minutes the same object while the clock steps within the same days
  const key = days.join()
  const merge = useMemo(() => combine(key ? key.split(',') : []), [key])
  const { minutes, step, states } = useQueries({
    queries: days.map((d) => footprintDayQuery(exchange, symbol, d)),
    combine: merge,
  })

  const data: FootprintData | null = step ? { minutes, step, now } : null
  return {
    on: s.on,
    /** Why there is nothing to draw, when footprint is on but cannot be. */
    blocked: !s.on
      ? null
      : !okx
        ? 'Footprint history comes from OKX only.'
        : BAR_MS[bar] > FOOTPRINT_MAX_BAR
          ? 'Footprint shows on 1H bars and shorter.'
          : null,
    data,
    states,
    retry: async (day: string) => {
      const result = await getFootprintDay(exchange, symbol, day, true)
      client.setQueryData(footprintDayQuery(exchange, symbol, day).queryKey, result)
    },
  }
}
