import { BAR_MS, type Bar, type Candle, type ExchangeId, type Position } from '@crypz/exchanges'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { instrumentQuery, latestCandlesQuery, olderCandlesQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { fmtSigned } from '@/lib/format'
import { mergeCandles } from '@/lib/candles'
import { useTicker } from '@/lib/okx-ws'
import type { Instrument } from '@/lib/book'
import { useIndicators } from '@/lib/indicators/store'
import { attachDrawingLayer, createMapper } from '@/components/drawings/layer'
import { attachIndicators } from '@/components/indicators/attach'
import { OhlcReadout } from './ohlc-readout'
import { BiasReadout } from '@/components/indicators/bias-readout'
import { useBias } from '@/components/indicators/use-bias'
import { createMosaicChart, palette, precisionFor, snapToChart, toBar, toChart, type Palette } from './chart-kit'

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
  refreshIndicators: () => void
  setBook: (id: string, spec: Instrument | null, failed?: boolean) => void
}

// The ticker can open the next bar before REST has it, so the series may already end past `k`. update() throws on a
// bar older than the series' last ("Cannot update oldest data"), so skip those; the poll catches up on its own.
function pushBar(series: ISeriesApi<'Candlestick'>, k: Candle) {
  const last = series.data().at(-1)
  if (last && toChart(k.time) < (last.time as number)) return
  series.update(toBar(k))
}

export function CandleChart({ exchange, symbol, bar, positions = [], focus, className }: Props) {
  // Data: Query owns fetching, the 10s live poll, caching and history paging.
  const latest = useQuery(latestCandlesQuery(exchange, symbol, bar))
  const older = useInfiniteQuery(olderCandlesQuery(exchange, symbol, bar, latest.data?.[0]?.time))
  const candles = useMemo(
    () => mergeCandles([...(older.data?.pages ?? []), latest.data ?? []]),
    [older.data, latest.data],
  )

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

  // The indicators read the forming candle too, so they move with the price instead of waiting for the next poll.
  const shownCandles = useMemo(() => {
    if (!liveBar) return candles
    const last = candles.at(-1)
    return last && last.time === liveBar.time ? [...candles.slice(0, -1), liveBar] : [...candles, liveBar]
  }, [candles, liveBar])

  // Top-down bias: the closed candles of its higher timeframe, fetched only while the bias is on and set above the chart's.
  const ind = useIndicators()
  const higherBar = ind.bias.on && BAR_MS[ind.bias.higher] > BAR_MS[bar] ? ind.bias.higher : null
  const hq = useQuery({ ...latestCandlesQuery(exchange, symbol, higherBar ?? bar), enabled: !!higherBar })
  const higher = useMemo(() => {
    if (!higherBar || !hq.data) return null
    const ms = BAR_MS[higherBar]
    // closed bars only: a forming higher bar would let the bias change inside it
    return { bar: higherBar, candles: hq.data.filter((k) => k.time + ms <= Date.now()) }
  }, [higherBar, hq.data])
  const bias = useBias(shownCandles, bar, higher)
  // the order-book layer sizes its levels from the instrument's spec, so that is fetched only while the layer is on
  const spec = useQuery({ ...instrumentQuery(symbol), enabled: ind.book.on })

  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [ready, setReady] = useState(false)
  // only the hovered candle is state; with nothing hovered the readout is the live candle, derived each render
  const [hovered, setHovered] = useState<number | null>(null)

  // What the chart's own event handlers read; refreshed every render so they never go stale.
  const live = useRef({ candles, shownCandles, bias, liveBar, positions, bar, loadOlder: () => {} })
  live.current = {
    candles,
    shownCandles,
    bias,
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
      const made = createMosaicChart(lw, box.current, (q) => {
        markers.setMarkers(buildMarkers(live.current.candles, live.current.positions, live.current.bar, q))
        layer.setPalette(q)
        indicators.refresh(q)
      })
      const { chart, candles: candleSeries } = made
      const markers = lw.createSeriesMarkers(candleSeries, [])
      const mapper = createMapper(
        chart,
        candleSeries,
        () => live.current.shownCandles,
        () => BAR_MS[live.current.bar],
      )
      // indicators sit under the candles; drawings above them. No footprint here: it needs trade history the
      // live chart does not load.
      const indicators = attachIndicators({
        chart,
        series: candleSeries,
        x: mapper.x,
        candles: () => live.current.shownCandles,
        barMs: () => BAR_MS[live.current.bar],
        bias: () => live.current.bias,
        liveBook: true,
        palette: palette(),
      })
      const layer = attachDrawingLayer({
        chart,
        series: candleSeries,
        el: box.current,
        symbol,
        mapper,
        palette: palette(),
      })
      chartRef.current = {
        chart,
        candles: candleSeries,
        markers,
        refreshIndicators: () => indicators.refresh(),
        setBook: indicators.setBook!,
      }
      dispose = () => {
        layer.dispose()
        indicators.dispose()
        made.dispose()
      }

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
        pushBar(c.candles, k)
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
    if (liveBar && chartRef.current) pushBar(chartRef.current.candles, liveBar)
  }, [ready, liveBar])

  // the readout: the hovered candle (live if it is the forming one), else the live candle, else the last polled one
  const shownBar =
    (hovered !== null && hovered !== liveBar?.time ? candles.find((c) => c.time === hovered) : null) ??
    liveBar ??
    candles.at(-1) ??
    null

  // 2c. Indicators: redraw from the candles and bias on screen (the layers follow pan and zoom on their own).
  useEffect(() => {
    chartRef.current?.refreshIndicators()
  }, [ready, shownCandles, bias])

  // 2d. Order book: tell the layer which instrument (and spec) it is drawing, so a symbol change never shows the last one's book.
  useEffect(() => {
    chartRef.current?.setBook(symbol, spec.data ?? null, spec.isError)
  }, [ready, symbol, spec.data, spec.isError])

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
      {shownBar && <OhlcReadout k={shownBar} />}
      {bias && <BiasReadout bias={bias} chartLabel={bar} higherLabel={higher?.bar ?? null} />}
      <div ref={box} className="relative min-h-0 flex-1 [&[data-cursor]_*]:cursor-[inherit]!" />
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
  const snap = (ms: number) => snapToChart(candles, ms)
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
