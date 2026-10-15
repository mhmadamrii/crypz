import { useEffect, useRef, useState } from 'react'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Bar, Candle, ExchangeId, Position } from '@crypz/exchanges'
import { getCandles } from '@/server/market'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned } from '@/lib/format'

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
const LIVE_POLL_MS = 10_000

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

type Readout = Candle & { change: number }

export function CandleChart({ exchange, symbol, bar, positions = [], focus, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const api = useRef<{
    chart: IChartApi
    candles: ISeriesApi<'Candlestick'>
    volume: ISeriesApi<'Histogram'>
    markers: ISeriesMarkersPluginApi<Time>
  } | null>(null)
  const data = useRef<Candle[]>([])
  const state = useRef({ loading: false, exhausted: false })
  const [readout, setReadout] = useState<Readout | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const paint = () => {
    const a = api.current
    if (!a) return
    const c = data.current
    const ref = c[c.length - 1]?.close ?? 1
    const precision = ref >= 1000 ? 1 : ref >= 10 ? 2 : ref >= 1 ? 4 : 6
    a.candles.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    a.candles.setData(c.map((k) => ({ time: toChart(k.time), open: k.open, high: k.high, low: k.low, close: k.close })))
    a.volume.setData(c.map((k) => ({ time: toChart(k.time), value: k.volume })))
    a.markers.setMarkers(buildMarkers(c, positionsRef.current, bar, palette()))
  }

  const loadOlder = async () => {
    const s = state.current
    if (s.loading || s.exhausted || !data.current.length) return false
    s.loading = true
    try {
      const older = await getCandles({ data: { exchange, symbol, bar, before: data.current[0].time } })
      const fresh = older.filter((k) => k.time < data.current[0].time)
      if (!fresh.length) s.exhausted = true
      else {
        const range = api.current?.chart.timeScale().getVisibleLogicalRange()
        data.current = [...fresh, ...data.current]
        paint()
        // keep the viewport where it was after prepending
        if (range)
          api.current?.chart
            .timeScale()
            .setVisibleLogicalRange({ from: range.from + fresh.length, to: range.to + fresh.length })
      }
      return fresh.length > 0
    } finally {
      s.loading = false
    }
  }

  // create chart once per symbol/bar
  useEffect(() => {
    let disposed = false
    let poll: ReturnType<typeof setInterval> | undefined
    let observer: MutationObserver | undefined
    data.current = []
    state.current = { loading: false, exhausted: false }
    setStatus('loading')
    setReadout(null)

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
        timeScale: { borderColor: p.border, timeVisible: bar !== '1D', secondsVisible: false, rightOffset: 6 },
        crosshair: {
          mode: lw.CrosshairMode.Normal,
          vertLine: { color: p.muted, style: lw.LineStyle.Dotted, labelBackgroundColor: p.fg },
          horzLine: { color: p.muted, style: lw.LineStyle.Dotted, labelBackgroundColor: p.fg },
        },
      })
      // Hollow candles in the world's two inks: filled = close above open, hollow = below.
      const candles = chart.addSeries(lw.CandlestickSeries, {
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
      candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } })
      const markers = lw.createSeriesMarkers(candles, [])
      api.current = { chart, candles, volume, markers }

      chart.subscribeCrosshairMove((param) => {
        const k = param.time ? data.current.find((c) => toChart(c.time) === param.time) : undefined
        const last = data.current[data.current.length - 1]
        const show = k ?? last
        if (show) setReadout({ ...show, change: (show.close - show.open) / show.open })
      })
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from < 15) void loadOlder()
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
        candles.applyOptions({
          upColor: q.fg,
          downColor: q.bg,
          borderUpColor: q.fg,
          borderDownColor: q.fg,
          wickUpColor: q.fg,
          wickDownColor: q.fg,
        })
        volume.applyOptions({ color: q.volume })
        markers.setMarkers(buildMarkers(data.current, positionsRef.current, bar, q))
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

      try {
        data.current = await getCandles({ data: { exchange, symbol, bar } })
        if (disposed) return
        paint()
        const n = data.current.length
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 140), to: n + 4 })
        const last = data.current[n - 1]
        if (last) setReadout({ ...last, change: (last.close - last.open) / last.open })
        setStatus('ready')
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
        return
      }

      // live: refresh the newest bars
      poll = setInterval(async () => {
        try {
          const latest = await getCandles({ data: { exchange, symbol, bar } })
          if (disposed || !latest.length) return
          const lastKnown = data.current[data.current.length - 1]?.time ?? 0
          for (const k of latest.filter((x) => x.time >= lastKnown)) {
            const i = data.current.findIndex((c) => c.time === k.time)
            if (i >= 0) data.current[i] = k
            else data.current.push(k)
            candles.update({ time: toChart(k.time), open: k.open, high: k.high, low: k.low, close: k.close })
            volume.update({ time: toChart(k.time), value: k.volume })
          }
        } catch {
          // transient network errors: next tick retries
        }
      }, LIVE_POLL_MS)
    })()

    return () => {
      disposed = true
      if (poll) clearInterval(poll)
      observer?.disconnect()
      api.current?.chart.remove()
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exchange, symbol, bar])

  // positions change (e.g. range filter) -> redraw markers only
  useEffect(() => {
    if (api.current && data.current.length)
      api.current.markers.setMarkers(buildMarkers(data.current, positions, bar, palette()))
  }, [positions, bar])

  // jump to a trade, paging older history until it is loaded
  useEffect(() => {
    if (!focus || status !== 'ready') return
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < 40 && data.current[0] && data.current[0].time > focus.from - BAR_MS[bar] * 20; i++) {
        if (cancelled || !(await loadOlder())) break
      }
      if (cancelled || !api.current) return
      const pad = Math.max(BAR_MS[bar] * 30, (focus.to - focus.from) * 0.6)
      api.current.chart.timeScale().setVisibleRange({ from: toChart(focus.from - pad), to: toChart(focus.to + pad) })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, status])

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
      {status !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 text-sm text-muted-foreground">
          {status === 'loading' ? 'Loading candles…' : `Could not load candles: ${error}`}
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
