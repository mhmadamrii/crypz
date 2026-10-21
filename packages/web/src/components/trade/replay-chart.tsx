import type { Bar, Candle } from '@crypz/exchanges'
import type { IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts'
import type { OpenPosition, ReplayTrade } from '@/lib/replay'

import { useEffect, useMemo, useRef, useState } from 'react'
import { computeBias, type Bias } from '@/lib/indicators/bias'
import { useIndicators } from '@/lib/indicators/store'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned, tone } from '@/lib/format'
import { fmtSize, signedSize } from '@/components/workspace/kit'
import { attachDrawingLayer, createMapper } from '@/components/drawings/layer'
import { attachBiasLayer } from '@/components/indicators/bias-layer'
import { BiasReadout } from '@/components/indicators/bias-readout'
import { attachFootprintLayer, type FootprintData } from '@/components/indicators/footprint-layer'
import { attachFvgLayer } from '@/components/indicators/fvg-layer'
import { attachOrderBlocksLayer } from '@/components/indicators/order-blocks-layer'
import { attachSessionsLayer } from '@/components/indicators/sessions-layer'
import { attachStructureLayer } from '@/components/indicators/structure-layer'
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
  /** The chart's interval, for the bias readout. */
  barLabel: Bar
  /** Closed candles of the bias's higher timeframe, when one is set above the chart's. */
  higher: { bar: Bar; candles: Candle[] } | null
  /** Footprint history to draw, when the indicator is on and its days have loaded. */
  footprint: FootprintData | null
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
  footprintAt: ReturnType<typeof attachFootprintLayer>['at']
}

export function ReplayChart({
  candles,
  intraday,
  barMs,
  symbol,
  barLabel,
  higher,
  footprint,
  position,
  trades,
  className,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<Handles | null>(null)
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<Candle | null>(null)
  const [theme, setTheme] = useState(0)
  const ind = useIndicators()
  // the bias is plain data from the revealed candles: the readout renders it, the layer draws its invalidation
  const bias = useMemo<Bias | null>(
    () =>
      ind.bias.on && candles.length
        ? computeBias({
            chart: candles,
            chartLabel: barLabel,
            higher: higher?.candles ?? null,
            higherLabel: higher?.bar ?? null,
            length: ind.structure.length,
          })
        : null,
    [ind.bias.on, ind.structure.length, candles, barLabel, higher],
  )
  const live = useRef({ candles, barMs, bias, footprint })
  live.current = { candles, barMs, bias, footprint }

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
        footprintLayer.refresh(q)
        sessions.refresh(q)
        fvg.refresh(q)
        structure.refresh(q)
        biasLayer.refresh(q)
        setTheme((n) => n + 1)
      })
      const mapper = createMapper(
        made.chart,
        made.candles,
        () => live.current.candles,
        () => live.current.barMs,
      )
      // the footprint's heat sits lowest and its cell columns replace the candles when zoomed in, so every other
      // indicator draws over it
      const footprintLayer = attachFootprintLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        data: () => live.current.footprint,
        barMs: () => live.current.barMs,
        palette: palette(),
        font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
      })
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
      // order blocks draw over the gaps: a zone is the base the gap was left from
      const orderBlocks = attachOrderBlocksLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        palette: palette(),
        font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
      })
      // structure labels and break lines sit over the candles, under the drawings
      const structure = attachStructureLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        palette: palette(),
        font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
      })
      const biasLayer = attachBiasLayer({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        bias: () => live.current.bias,
        palette: palette(),
        font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
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
        footprintLayer.dispose()
        sessions.dispose()
        fvg.dispose()
        orderBlocks.dispose()
        structure.dispose()
        biasLayer.dispose()
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
          footprintLayer.refresh(q)
          sessions.refresh(q)
          fvg.refresh(q)
          orderBlocks.refresh(q)
          structure.refresh(q)
          biasLayer.refresh(q)
        },
        footprintAt: footprintLayer.at,
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

  // the higher timeframe can move the bias, and a footprint day can land, without a new chart candle
  useEffect(() => {
    ref.current?.refreshIndicators()
  }, [ready, bias, footprint?.minutes])

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
  const fp = k && footprint ? ref.current?.footprintAt(k.time) : null
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
          {fp && (
            <>
              <span>
                Δ <span className={tone(fp.buy - fp.sell)}>{signedSize(fp.buy - fp.sell)}</span>
              </span>
              <span>
                Vol <span className="text-foreground">{fmtSize(fp.buy + fp.sell) || '0'}</span>
              </span>
              {fp.absorbed && (
                <span className={fp.absorbed.side === 'bid' ? 'text-up' : 'text-down'}>
                  {fp.absorbed.side === 'bid' ? 'Bids' : 'Asks'} absorbed {fmtSize(fp.absorbed.size)} at{' '}
                  {fmtPrice(fp.absorbed.price)}
                </span>
              )}
            </>
          )}
        </div>
      )}
      {bias && <BiasReadout bias={bias} chartLabel={barLabel} higherLabel={higher?.bar ?? null} />}
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
