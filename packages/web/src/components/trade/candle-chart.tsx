import { BAR_MS, type Bar, type Candle, type ExchangeId, type Position } from '@crypz/exchanges'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { latestCandlesQuery, olderCandlesQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned } from '@/lib/format'
import { useTicker } from '@/lib/okx-ws'
import { createMosaicChart, palette, precisionFor, toBar, toChart, type Palette } from './chart-kit'

import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

type Props = {
  exchange: ExchangeId
  symbol: string
  bar: Bar
  /** Your closed positions on this symbol; drawn as entry/exit markers. */
  positions?: Position[]
  /** Scroll the chart to this window (ms), loading older history if needed. */
  focus?: { from: number; to: number } | null
  className?: string
}

type Chart = {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  markers: ISeriesMarkersPluginApi<Time>
}

type Readout = Candle & { change: number }

export function CandleChart({ exchange, symbol, bar, positions = [], focus, className }: Props) {
  // Data: Query owns fetching, the 10s live poll, caching and history paging.
  const latest = useQuery(latestCandlesQuery(exchange, symbol, bar))
  const older = useInfiniteQuery(olderCandlesQuery(exchange, symbol, bar, latest.data?.[0]?.time))
  const candles = useMemo(() => {
    const byTime = new Map<number, Candle>()
    for (const page of older.data?.pages ?? []) for (const k of page) byTime.set(k.time, k)
    for (const k of latest.data ?? []) byTime.set(k.time, k)
    return [...byTime.values()].sort((a, b) => a.time - b.time)
  }, [older.data, latest.data])

  // One live price for every timeframe. Between REST polls (and on a cached timeframe you just switched to) the
  // forming candle follows OKX's ticker, so 15m and 1W end on the same last price. A tick past the bar's end opens
  // the next bar; month bars vary in length, so those wait for the poll to start one.
  const tick = useTicker(symbol)
  const liveBar = useMemo((): Candle | null => {
    const last = candles.at(-1)
    if (!tick || !last) return null
    const px = Number(tick.last)
    const at = Number(tick.ts)
    if (at < last.time) return null
    if (at >= last.time + BAR_MS[bar] && !bar.endsWith('M'))
      return {
        time: last.time + BAR_MS[bar] * Math.floor((at - last.time) / BAR_MS[bar]),
        open: px,
        high: px,
        low: px,
        close: px,
      }
    return { ...last, close: px, high: Math.max(last.high, px), low: Math.min(last.low, px) }
  }, [tick, candles, bar])

  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [ready, setReady] = useState(false)
  // only the hovered candle is state; with nothing hovered the readout is the live candle, derived each render
  const [hovered, setHovered] = useState<number | null>(null)

  // What the chart's own event handlers read; refreshed every render so they never go stale.
  const live = useRef({ candles, liveBar, positions, bar, loadOlder: () => {} })
  live.current = {
    candles,
    liveBar,
    positions,
    bar,
    loadOlder: () => {
      if (older.hasNextPage && !older.isFetchingNextPage) void older.fetchNextPage()
    },
  }

  // 1. Lifecycle: create the imperative chart once, tear it down on unmount.
  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    ;(async () => {
      const lw = await import('lightweight-charts')
      if (disposed || !box.current) return
      const made = createMosaicChart(lw, box.current, (q) =>
        markers.setMarkers(buildMarkers(live.current.candles, live.current.positions, live.current.bar, q)),
      )
      const { chart, candles: candleSeries } = made
      const markers = lw.createSeriesMarkers(candleSeries, [])
      chartRef.current = { chart, candles: candleSeries, markers }
      dispose = made.dispose

      chart.subscribeCrosshairMove((param) => {
        // also fires with no pointer at all; then nothing is hovered and the readout falls back to live
        const hit = param.time ? live.current.candles.find((c) => toChart(c.time) === param.time) : undefined
        setHovered(hit ? hit.time : null)
      })
      // scrolling near the left edge pages in older history
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from < 15) live.current.loadOlder()
      })
      setReady(true)
    })()
    return () => {
      disposed = true
      dispose()
      chartRef.current = null
    }
  }, [])

  // 2. Sync: push candles and markers into the chart whenever they change.
  const shown = useRef({ key: '', first: 0, length: 0 })
  useEffect(() => {
    const c = chartRef.current
    if (!c || !candles.length) return
    const key = `${exchange}:${symbol}:${bar}`
    const prev = shown.current
    const first = candles[0].time
    const ts = c.chart.timeScale()

    if (
      prev.key === key &&
      prev.first === first &&
      candles.length >= prev.length &&
      candles.length - prev.length <= 2
    ) {
      // live poll: only the newest bars moved
      for (const k of candles.slice(Math.max(0, prev.length - 1))) {
        c.candles.update(toBar(k))
      }
    } else {
      c.candles.applyOptions({ priceFormat: precisionFor(candles[candles.length - 1].close) })
      const range = ts.getVisibleLogicalRange()
      c.candles.setData(candles.map(toBar))
      if (prev.key !== key) {
        c.chart.applyOptions({ timeScale: { timeVisible: BAR_MS[bar] < BAR_MS['1D'] } })
        ts.setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 4 })
        setHovered(null)
      } else if (range && first < prev.first) {
        // older history prepended: keep the viewport where it was
        const added = candles.findIndex((k) => k.time === prev.first)
        ts.setVisibleLogicalRange({ from: range.from + added, to: range.to + added })
      }
    }
    c.markers.setMarkers(buildMarkers(candles, positions, bar, palette()))
    shown.current = { key, first, length: candles.length }
  }, [ready, candles, positions, exchange, symbol, bar])

  // 2b. Live tick: move the forming candle (runs after a data sync, so the poll's bar is never left stale on top).
  useEffect(() => {
    if (liveBar) chartRef.current?.candles.update(toBar(liveBar))
  }, [ready, liveBar])

  // the readout: the hovered candle (live if it is the forming one), else the live candle, else the last polled one
  const shownBar =
    (hovered !== null && hovered !== liveBar?.time ? candles.find((c) => c.time === hovered) : null) ??
    liveBar ??
    candles.at(-1) ??
    null
  const readout: Readout | null = shownBar && { ...shownBar, change: (shownBar.close - shownBar.open) / shownBar.open }

  // 3. Focus: page in history until the trade is covered, then frame it once.
  const framed = useRef<Props['focus']>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = older
  useEffect(() => {
    const c = chartRef.current
    if (!c || !focus || !candles.length || framed.current === focus) return
    if (candles[0].time > focus.from - BAR_MS[bar] * 20 && hasNextPage) {
      if (!isFetchingNextPage) void fetchNextPage()
      return
    }
    const pad = Math.max(BAR_MS[bar] * 30, (focus.to - focus.from) * 0.6)
    c.chart.timeScale().setVisibleRange({ from: toChart(focus.from - pad), to: toChart(focus.to + pad) })
    framed.current = focus
  }, [ready, focus, candles, bar, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className={cn('relative flex min-h-80 flex-col', className)}>
      <div className="pointer-events-none absolute top-2 left-3 z-10 flex flex-wrap gap-x-3 gap-y-0.5 num text-[11px] text-muted-foreground">
        {readout && (
          <>
            <span>
              O <span className="text-foreground">{fmtPrice(readout.open)}</span>
            </span>
            <span>
              H <span className="text-foreground">{fmtPrice(readout.high)}</span>
            </span>
            <span>
              L <span className="text-foreground">{fmtPrice(readout.low)}</span>
            </span>
            <span>
              C <span className="text-foreground">{fmtPrice(readout.close)}</span>
            </span>
            <span className="text-foreground">{fmtSigned(readout.change * 100)}%</span>
          </>
        )}
      </div>
      <div ref={box} className="min-h-0 flex-1" />
      {!latest.isSuccess && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 text-sm text-muted-foreground">
          {latest.isError ? `Could not load candles: ${latest.error.message}` : 'Loading candles…'}
        </div>
      )}
    </div>
  )
}

/** Entries as arrows (up = long, down = short), exits as squares toned by realized PnL. */
function buildMarkers(candles: Candle[], positions: Position[], bar: Bar, p: Palette) {
  if (!candles.length) return []
  const first = candles[0].time
  const span = BAR_MS[bar]
  // snap a timestamp to the candle that contains it
  const snap = (ms: number) => {
    let lo = 0
    let hi = candles.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (candles[mid].time <= ms) lo = mid
      else hi = mid - 1
    }
    return toChart(candles[lo].time)
  }
  const out: (SeriesMarker<Time> & { time: UTCTimestamp })[] = []
  for (const pos of positions) {
    if (pos.closedAt < first) continue
    if (pos.openedAt >= first - span)
      out.push({
        time: snap(pos.openedAt),
        position: pos.side === 'long' ? 'belowBar' : 'aboveBar',
        shape: pos.side === 'long' ? 'arrowUp' : 'arrowDown',
        color: p.fg,
        text: pos.side === 'long' ? 'L' : 'S',
        size: 1,
      })
    out.push({
      time: snap(pos.closedAt),
      position: pos.side === 'long' ? 'aboveBar' : 'belowBar',
      shape: 'square',
      color: pos.realizedPnl > 0 ? p.up : p.down,
      text: fmtSigned(pos.realizedPnl),
      size: 1,
    })
  }
  return out.sort((a, b) => a.time - b.time)
}
