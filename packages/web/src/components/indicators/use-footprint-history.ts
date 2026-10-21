import { useEffect, useMemo, useRef, useState } from 'react'
import { QueryObserver, useQueries, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BAR_MS, type Bar, type Candle, type ExchangeId } from '@crypz/exchanges'
import { FIRST_HISTORY_DAY, minutesOf, okxDays, type Minute } from '@/lib/footprint'
import { useIndicators } from '@/lib/indicators/store'
import { footprintDayQuery, getFootprintDay } from '@/lib/queries'
import { FOOTPRINT_MAX_BAR, type FootprintData } from './footprint-layer'

// Which OKX days the replay footprint needs, and whether to build the ones nobody has. The days are those holding
// the last 150 revealed bars (at most three), so a long session only asks for what is on screen.
//
// Nothing is downloaded without asking. The hook first only peeks: days already built load at once, and the rest
// raise one persistent toast with a Build button. Building (or retrying a failed day) is consent for the rest of
// the session; the session remounts on a new symbol or start, which asks again. Later days then build as the clock
// reaches them, each as a promise toast; a failure stays up with Retry.

type DayResult = Awaited<ReturnType<typeof getFootprintDay>>
type DayState = DayResult | { day: string; status: 'pending' }

const LOOKBACK = 150
const MAX_DAYS = 3
const PROMPT = 'footprint:prompt'

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const listOf = (days: string[]) =>
  days.length > 1 ? `${days.slice(0, -1).map(dayLabel).join(', ')} and ${dayLabel(days.at(-1)!)}` : dayLabel(days[0])
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

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

/** Resolves once the day's build query is ready; rejects with the reason it is not. */
function settled(client: QueryClient, exchange: ExchangeId, symbol: string, day: string) {
  return new Promise<void>((resolve, reject) => {
    const observer = new QueryObserver(client, footprintDayQuery(exchange, symbol, day, 'build'))
    let stop = () => {}
    const check = (r: UseQueryResult<DayResult>) => {
      const d = r.data
      if (!r.isError && (!d || d.status === 'pending')) return
      stop()
      if (d?.status === 'ready') resolve()
      else reject(new Error(r.isError ? r.error.message : d?.status === 'failed' ? d.error : 'Could not build.'))
    }
    stop = observer.subscribe(check)
    check(observer.getCurrentResult())
  })
}

export function useFootprintHistory(exchange: ExchangeId, symbol: string, bar: Bar, now: number, revealed: Candle[]) {
  const s = useIndicators().footprint
  const client = useQueryClient()
  // consent to download days nobody has built, for the rest of this session
  const [build, setBuild] = useState(false)
  // days whose prompt the user closed; they are not asked about again this session
  const [skipped, setSkipped] = useState<string[]>([])
  const on = s.on && exchange === 'okx' && BAR_MS[bar] <= FOOTPRINT_MAX_BAR
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
  const mode = build ? 'build' : 'peek'
  const { minutes, step, states } = useQueries({
    queries: days.map((d) => ({
      ...footprintDayQuery(exchange, symbol, d, mode),
      // a day the peek found built is the same once building is allowed; reuse it rather than fetch it again
      initialData: () => {
        const peeked = client.getQueryData(footprintDayQuery(exchange, symbol, d, 'peek').queryKey)
        return mode === 'build' && peeked?.status === 'ready' ? peeked : undefined
      },
    })),
    combine: merge,
  })

  // The prompt: one persistent toast for the days not built yet, until the user builds or closes it. Closing it
  // ourselves (footprint off, nothing left to ask, a new session) fires Sonner's onDismiss too, so that is marked.
  const asking = build ? [] : states.filter((d) => d.status === 'missing' && !skipped.includes(d.day)).map((d) => d.day)
  const askKey = asking.join()
  const prompt = useRef({ shown: false, quiet: false })
  useEffect(() => {
    if (!askKey) {
      if (prompt.current.shown) {
        prompt.current = { shown: false, quiet: true }
        toast.dismiss(PROMPT)
      }
      return
    }
    const ask = askKey.split(',')
    prompt.current.shown = true
    toast(`Footprint for ${listOf(ask)} isn’t built yet`, {
      id: PROMPT,
      description:
        'Built once from OKX trade files, about 5–15 seconds a day; after that it loads at once. Later days in this session build as you reach them.',
      duration: Infinity,
      closeButton: true,
      action: { label: 'Build', onClick: () => setBuild(true) },
      onDismiss: () => {
        const quiet = prompt.current.quiet
        prompt.current = { shown: false, quiet: false }
        if (!quiet) setSkipped((s) => [...s, ...ask])
      },
    })
  }, [askKey])
  useEffect(
    () => () => {
      prompt.current.quiet = true
      toast.dismiss(PROMPT)
    },
    [],
  )

  // Each day is announced once: a promise toast while it builds, an info toast while OKX has not published it,
  // and a failure that stays up with Retry. Retry rebuilds the day and lets it be announced again.
  const announced = useRef(new Set<string>())
  const statusKey = `${mode}|${states.map((d) => `${d.day}:${d.status}`).join()}`
  useEffect(() => {
    const retry = async (day: string) => {
      setBuild(true)
      const result = await getFootprintDay(exchange, symbol, day, { retry: true })
      announced.current.delete(day)
      client.setQueryData(footprintDayQuery(exchange, symbol, day, 'build').queryKey, result)
    }
    const failure = (day: string, reason: string) => ({
      message: `Footprint for ${dayLabel(day)} could not be built`,
      description: reason,
      duration: Infinity,
      closeButton: true,
      action: { label: 'Retry', onClick: () => void retry(day).catch(() => {}) },
    })
    for (const d of states) {
      if (announced.current.has(d.day)) continue
      const id = `footprint:${d.day}`
      if (d.status === 'unpublished')
        toast.info(`Footprint for ${dayLabel(d.day)} isn’t available yet`, {
          id,
          description: `OKX publishes that day’s trades around ${clock(d.at)}.`,
        })
      else if (d.status === 'failed') {
        const { message, ...rest } = failure(d.day, d.error)
        toast.error(message, { id, ...rest })
      } else if (build && d.status === 'pending')
        toast.promise(settled(client, exchange, symbol, d.day), {
          id,
          loading: `Building footprint for ${dayLabel(d.day)}…`,
          success: `Footprint for ${dayLabel(d.day)} is ready`,
          error: (e: Error) => failure(d.day, e.message),
        })
      else continue
      announced.current.add(d.day)
    }
    // states is read through statusKey, which changes whenever a day or its status does
  }, [statusKey])

  const data: FootprintData | null = step ? { minutes, step, now } : null
  return { data }
}
