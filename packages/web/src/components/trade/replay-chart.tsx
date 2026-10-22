import type { Bar, Candle } from '@crypz/exchanges'
import type { IPriceLine, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time } from 'lightweight-charts'
import type { OpenPosition, ReplayTrade } from '@/lib/replay'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtPrice, fmtSigned, fmtSize, signedSize, tone } from '@/lib/format'
import { attachDrawingLayer, createMapper } from '@/components/drawings/layer'
import { attachIndicators } from '@/components/indicators/attach'
import { OhlcReadout } from './ohlc-readout'
import { BiasReadout } from '@/components/indicators/bias-readout'
import type { FootprintData } from '@/components/indicators/footprint-layer'
import { useBias } from '@/components/indicators/use-bias'
import { createMosaicChart, palette, precisionFor, snapToChart, toBar, toChart, type Palette } from './chart-kit'

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
  footprintAt: ReturnType<typeof attachIndicators>['footprintAt']
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
  const bias = useBias(candles, barLabel, higher)
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
        indicators.refresh(q)
        setTheme((n) => n + 1)
      })
      const mapper = createMapper(
        made.chart,
        made.candles,
        () => live.current.candles,
        () => live.current.barMs,
      )
      // indicators sit under the candles; drawings above them
      const indicators = attachIndicators({
        chart: made.chart,
        series: made.candles,
        x: mapper.x,
        candles: () => live.current.candles,
        barMs: () => live.current.barMs,
        bias: () => live.current.bias,
        footprint: () => live.current.footprint,
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
        indicators.dispose()
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
        refreshIndicators: indicators.refresh,
        footprintAt: indicators.footprintAt,
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
    // a step appended one bar, or the forming candle grew or closed in place: the last bar is all that changed
    if (prev.first === first && (candles.length === prev.length || candles.length === prev.length + 1))
      c.candles.update(toBar(last))
    else {
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
    const snap = (ms: number) => snapToChart(candles, ms)
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
  const fp = k && footprint ? ref.current?.footprintAt?.(k.time) : null
  return (
    <div className={cn('relative min-h-0', className)}>
      {k && (
        <OhlcReadout k={k}>
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
        </OhlcReadout>
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
