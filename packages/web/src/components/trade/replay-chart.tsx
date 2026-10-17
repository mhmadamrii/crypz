import type { Candle } from '@crypz/exchanges'
import type { IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts'
import type { OpenPosition, ReplayTrade } from '@/lib/replay'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned } from '@/lib/format'
import { attachDrawingLayer, createMapper } from '@/components/drawings/layer'
import { attachFvgLayer } from '@/components/indicators/fvg-layer'
import { attachSessionsLayer } from '@/components/indicators/sessions-layer'
import { createMosaicChart, palette, precisionFor, toBar, toChart, type Palette } from './chart-kit'

type Props = {
  /** Only the revealed candles; the chart never sees the future. */
  candles: Candle[]
  /** Show clock times on the axis (bars shorter than a day). */
  intraday: boolean
  /** Bar length in ms, so drawings can extend past the last candle. */
  barMs: number
  /** Drawings are kept per instrument. */
  symbol: string
  position: OpenPosition | null
  trades: ReplayTrade[]
  className?: string
}

type Handles = {
  timeVisible: (on: boolean) => void
  candles: ISeriesApi<'Candlestick'>
  markers: ISeriesMarkersPluginApi<Time>
  setView: (n: number) => void
  palette: Palette
  lines: IPriceLine[]
  dashed: number
  refreshIndicators: (p?: Palette) => void
}

export function ReplayChart({ candles, intraday, barMs, symbol, position, trades, className }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<Handles | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<Candle | null>(null)
  const [theme, setTheme] = useState(0)
  const live = useRef({ candles, barMs })
  live.current = { candles, barMs }

  // 1. Lifecycle: create the chart once, tear it down on unmount.
  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    ;(async () => {
      const lw = await import('lightweight-charts')
      if (disposed || !box.current) return
      const made = createMosaicChart(lw, box.current, (q) => {
        if (ref.current) ref.current.palette = q
        layer.setPalette(q)
        sessions.refresh(q)
        fvg.refresh(q)
        setTheme((n) => n + 1)
      })
      const mapper = createMapper(
        made.chart,
        made.candles,
        () => live.current.candles,
        () => live.current.barMs,
      )
      // indicators sit under the candles; drawings above them
      const sessions = attachSessionsLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        barMs: () => live.current.barMs,
        palette: palette(),
        font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
      })
      // gaps draw over the session boxes: they are narrower and nearer to price
      const fvg = attachFvgLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        palette: palette(),
      })
      const layer = attachDrawingLayer({
        chart: made.chart,
        series: made.candles,
        el: box.current,
        symbol,
        mapper,
        palette: palette(),
      })
      dispose = () => {
        layer.dispose()
        sessions.dispose()
        fvg.dispose()
        made.dispose()
      }
      ref.current = {
        timeVisible: (on) => made.chart.applyOptions({ timeScale: { timeVisible: on } }),
        candles: made.candles,
        markers: lw.createSeriesMarkers(made.candles, []),
        setView: (n) => made.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 8 }),
        palette: palette(),
        lines: [],
        dashed: lw.LineStyle.Dashed,
        refreshIndicators: (q) => {
          sessions.refresh(q)
          fvg.refresh(q)
        },
      }
      made.chart.subscribeCrosshairMove((param) => {
        const k = param.time ? live.current.candles.find((c) => toChart(c.time) === param.time) : undefined
        setHover(k ?? null)
      })
      setReady(true)
    })()
    return () => {
      disposed = true
      dispose()
      ref.current = null
    }
  }, [])

  // 2. Candles: a step appends one bar; anything else (first load, a new interval) resets the series.
  const shown = useRef({ first: 0, length: 0 })
  useEffect(() => {
    const c = ref.current
    if (!c || !candles.length) return
    c.timeVisible(intraday)
    const prev = shown.current
    const first = candles[0].time
    const last = candles[candles.length - 1]
    if (prev.first === first && candles.length === prev.length + 1) c.candles.update(toBar(last))
    // the forming candle grew, or a step closed it: same count, the last bar changed in place
    else if (prev.first === first && candles.length === prev.length) c.candles.update(toBar(last))
    else if (prev.first !== first || candles.length !== prev.length) {
      c.candles.applyOptions({ priceFormat: precisionFor(candles[candles.length - 1].close) })
      c.candles.setData(candles.map(toBar))
      if (prev.first !== first) c.setView(candles.length)
    }
    shown.current = { first, length: candles.length }
    c.refreshIndicators()
  }, [ready, candles, intraday])

  // 3. Orders: entry/exit markers and the open position's entry, stop and target lines.
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const p = c.palette
    // orders placed on another interval land on the candle that contains them
    const snap = (ms: number) => {
      let lo = 0
      let hi = candles.length - 1
      if (hi < 0) return toChart(ms)
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (candles[mid].time <= ms) lo = mid
        else hi = mid - 1
      }
      return toChart(candles[lo].time)
    }
    const marks: SeriesMarker<Time>[] = []
    for (const t of trades) {
      marks.push(entryMark(t, p, snap), {
        time: snap(t.exitTime),
        position: t.side === 'long' ? 'aboveBar' : 'belowBar',
        shape: 'square',
        color: t.pct > 0 ? p.up : p.down,
        text: `${fmtSigned(t.pct)}%`,
        size: 1,
      })
    }
    if (position) marks.push(entryMark(position, p, snap))
    c.markers.setMarkers(marks.sort((a, b) => (a.time as number) - (b.time as number)))

    for (const l of c.lines) c.candles.removePriceLine(l)
    c.lines = []
    if (position) {
      const line = (price: number, title: string, color: string) =>
        c.lines.push(
          c.candles.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: c.dashed, axisLabelVisible: true }),
        )
      line(position.entry, position.side === 'long' ? 'Long' : 'Short', p.fg)
      if (position.stop !== null) line(position.stop, 'Stop', p.down)
      if (position.target !== null) line(position.target, 'Target', p.up)
      line(position.liq, 'Liq', p.muted)
    }
  }, [ready, theme, trades, position, candles])

  const k = hover ?? candles[candles.length - 1]
  return (
    <div className={cn('relative min-h-0', className)}>
      {k && (
        <div className="pointer-events-none absolute top-2 left-3 z-10 flex flex-wrap gap-x-3 gap-y-0.5 num text-[11px] text-muted-foreground">
          <span>
            O <span className="text-foreground">{fmtPrice(k.open)}</span>
          </span>
          <span>
            H <span className="text-foreground">{fmtPrice(k.high)}</span>
          </span>
          <span>
            L <span className="text-foreground">{fmtPrice(k.low)}</span>
          </span>
          <span>
            C <span className="text-foreground">{fmtPrice(k.close)}</span>
          </span>
          <span className="text-foreground">{fmtSigned(((k.close - k.open) / k.open) * 100)}%</span>
        </div>
      )}
      <div ref={box} className="absolute inset-0 [&[data-cursor]_*]:cursor-[inherit]!" />
    </div>
  )
}

const entryMark = (t: OpenPosition, p: Palette, snap: (ms: number) => Time): SeriesMarker<Time> => ({
  time: snap(t.entryTime),
  position: t.side === 'long' ? 'belowBar' : 'aboveBar',
  shape: t.side === 'long' ? 'arrowUp' : 'arrowDown',
  color: p.fg,
  text: t.side === 'long' ? 'L' : 'S',
  size: 1,
})
