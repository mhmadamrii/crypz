import type { Bar, Candle, ExchangeId, Position } from '@crypz/exchanges'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { latestCandlesQuery, olderCandlesQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned } from '@/lib/format'

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

const BAR_MS: Record<Bar, number> = { '15m': 9e5, '1H': 36e5, '4H': 144e5, '1D': 864e5 }

// lightweight-charts plots UTC; shift to the viewer's zone so axis labels read local time.
const tz = () => -new Date().getTimezoneOffset() * 60
const toChart = (ms: number) => (Math.floor(ms / 1000) + tz()) as UTCTimestamp

/** Resolve a CSS colour (incl. oklch / var()) to rgba via canvas, since the chart parses only basic formats. */
function resolveColor(expr: string, alpha = 1) {
  const probe = document.createElement('i')
  probe.style.color = expr
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r},${g},${b},${alpha})`
}

function palette() {
  return {
    bg: resolveColor('var(--background)'),
    fg: resolveColor('var(--foreground)'),
    muted: resolveColor('var(--muted-foreground)'),
    hairline: resolveColor('var(--hairline)'),
    border: resolveColor('var(--border)'),
    volume: resolveColor('var(--muted-foreground)', 0.28),
    up: resolveColor('var(--up)'),
    down: resolveColor('var(--down)'),
  }
}

type Chart = {
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  volume: ISeriesApi<'Histogram'>
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

  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [ready, setReady] = useState(false)
  const [readout, setReadout] = useState<Readout | null>(null)

  // What the chart's own event handlers read; refreshed every render so they never go stale.
  const live = useRef({ candles, positions, bar, loadOlder: () => {} })
  live.current = {
    candles,
    positions,
    bar,
    loadOlder: () => {
      if (older.hasNextPage && !older.isFetchingNextPage) void older.fetchNextPage()
    },
  }

  // 1. Lifecycle: create the imperative chart once, tear it down on unmount.
  useEffect(() => {
    let disposed = false
    let observer: MutationObserver | undefined
    ;(async () => {
      const lw = await import('lightweight-charts')
      if (disposed || !box.current) return
      const p = palette()
      const chart = lw.createChart(box.current, {
        autoSize: true,
        layout: {
          background: { type: lw.ColorType.Solid, color: p.bg },
          textColor: p.muted,
          fontFamily: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
          fontSize: 11,
          attributionLogo: true,
          panes: { separatorColor: p.border },
        },
        grid: { vertLines: { color: p.hairline }, horzLines: { color: p.hairline } },
        rightPriceScale: { borderColor: p.border },
        timeScale: { borderColor: p.border, secondsVisible: false, rightOffset: 6 },
        crosshair: {
          mode: lw.CrosshairMode.Normal,
          vertLine: { color: p.muted, style: lw.LineStyle.Dotted, labelBackgroundColor: p.fg },
          horzLine: { color: p.muted, style: lw.LineStyle.Dotted, labelBackgroundColor: p.fg },
        },
      })
      // Hollow candles in the world's two inks: filled = close above open, hollow = below.
      const candleSeries = chart.addSeries(lw.CandlestickSeries, {
        upColor: p.fg,
        downColor: p.bg,
        borderUpColor: p.fg,
        borderDownColor: p.fg,
        wickUpColor: p.fg,
        wickDownColor: p.fg,
        priceLineColor: p.muted,
        priceLineStyle: lw.LineStyle.Dashed,
      })
      const volume = chart.addSeries(lw.HistogramSeries, {
        color: p.volume,
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } })
      const markers = lw.createSeriesMarkers(candleSeries, [])
      chartRef.current = { chart, candles: candleSeries, volume, markers }

      chart.subscribeCrosshairMove((param) => {
        const data = live.current.candles
        const k = (param.time && data.find((c) => toChart(c.time) === param.time)) || data[data.length - 1]
        if (k) setReadout({ ...k, change: (k.close - k.open) / k.open })
      })
      // scrolling near the left edge pages in older history
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from < 15) live.current.loadOlder()
      })

      // follow the theme toggle
      observer = new MutationObserver(() => {
        const q = palette()
        chart.applyOptions({
          layout: {
            background: { type: lw.ColorType.Solid, color: q.bg },
            textColor: q.muted,
            panes: { separatorColor: q.border },
          },
          grid: { vertLines: { color: q.hairline }, horzLines: { color: q.hairline } },
          rightPriceScale: { borderColor: q.border },
          timeScale: { borderColor: q.border },
          crosshair: {
            vertLine: { color: q.muted, labelBackgroundColor: q.fg },
            horzLine: { color: q.muted, labelBackgroundColor: q.fg },
          },
        })
        candleSeries.applyOptions({
          upColor: q.fg,
          downColor: q.bg,
          borderUpColor: q.fg,
          borderDownColor: q.fg,
          wickUpColor: q.fg,
          wickDownColor: q.fg,
        })
        volume.applyOptions({ color: q.volume })
        markers.setMarkers(buildMarkers(live.current.candles, live.current.positions, live.current.bar, q))
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      setReady(true)
    })()
    return () => {
      disposed = true
      observer?.disconnect()
      chartRef.current?.chart.remove()
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
        c.candles.update({ time: toChart(k.time), open: k.open, high: k.high, low: k.low, close: k.close })
        c.volume.update({ time: toChart(k.time), value: k.volume })
      }
    } else {
      const ref = candles[candles.length - 1].close
      const precision = ref >= 1000 ? 1 : ref >= 10 ? 2 : ref >= 1 ? 4 : 6
      c.candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
      const range = ts.getVisibleLogicalRange()
      c.candles.setData(
        candles.map((k) => ({ time: toChart(k.time), open: k.open, high: k.high, low: k.low, close: k.close })),
      )
      c.volume.setData(candles.map((k) => ({ time: toChart(k.time), value: k.volume })))
      if (prev.key !== key) {
        c.chart.applyOptions({ timeScale: { timeVisible: bar !== '1D' } })
        ts.setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 4 })
        const last = candles[candles.length - 1]
        setReadout({ ...last, change: (last.close - last.open) / last.open })
      } else if (range && first < prev.first) {
        // older history prepended: keep the viewport where it was
        const added = candles.findIndex((k) => k.time === prev.first)
        ts.setVisibleLogicalRange({ from: range.from + added, to: range.to + added })
      }
    }
    c.markers.setMarkers(buildMarkers(candles, positions, bar, palette()))
    shown.current = { key, first, length: candles.length }
  }, [ready, candles, positions, exchange, symbol, bar])

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
function buildMarkers(candles: Candle[], positions: Position[], bar: Bar, p: ReturnType<typeof palette>) {
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
