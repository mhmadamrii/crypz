import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BAR_MS, type Bar as Interval, type Candle } from '@crypz/exchanges'
import type { IChartApi, IPriceLine, ISeriesApi, PriceFormat } from 'lightweight-charts'
import { createMosaicChart, palette, precisionFor, toBar, toChart } from '@/components/trade/chart-kit'

// Price on top, one statistic under it, and optionally its per-period bars at the bottom: the shape CVD, open
// interest, long/short, taker flow and basis all share. The statistic is ink; bars carry up/down because each is a
// signed change. Panes stack in that order and can be resized by dragging their separators.

export type Point = { time: number; value: number }
export type Bar = { time: number; value: number; tone: 'up' | 'down' }

type Format = 'volume' | 'percent' | 'ratio'

type Props = {
  /** What is shown (symbol, period, variant). The view fits the data once per key, then the user owns it. */
  frameKey: string
  /** The period every point stands for; intraday periods get times on the axis. */
  bar: Interval
  candles: Candle[]
  line?: Point[]
  lineFormat?: Format
  /** Decimals for a percent line. */
  percentDigits?: number
  /** A dashed reference level on the line: 0 for a delta, 1 for a ratio, 50 for a share. */
  baseline?: number
  /** Histograms in the bottom pane, e.g. buy volume up and sell volume down. Memoize `line` and `bars`: a new
   *  array re-sends the series to the chart. */
  bars?: Bar[][]
  barFormat?: Format
  /** The hovered period (ms), or null when the pointer leaves. */
  onHover: (time: number | null) => void
  /** Readout and overlays, drawn over the top-left of the chart. */
  children?: ReactNode
}

type LW = typeof import('lightweight-charts')

type Chart = {
  lw: LW
  chart: IChartApi
  candles: ISeriesApi<'Candlestick'>
  line?: ISeriesApi<'Line'>
  base?: IPriceLine
  bars: ISeriesApi<'Histogram'>[]
}

// The library's own percent format rounds to its precision on the axis (a premium of −0.044% reads −0.0%), so
// percent lines get a formatter with their own decimals.
const formatOf = (f: Format, digits = 2): PriceFormat =>
  f === 'volume'
    ? { type: 'volume', precision: 2, minMove: 0.01 }
    : f === 'percent'
      ? { type: 'custom', minMove: 10 ** -digits, formatter: (v: number) => `${v.toFixed(digits)}%` }
      : { type: 'price', precision: 2, minMove: 0.01 }

const NO_BARS: Bar[][] = []

const fade = (rgba: string, alpha: number) => rgba.replace(/,[\d.]+\)$/, `,${alpha})`)

export function IndicatorChart({
  frameKey,
  bar,
  candles,
  line,
  lineFormat = 'volume',
  percentDigits,
  baseline,
  bars = NO_BARS,
  barFormat = 'volume',
  onHover,
  children,
}: Props) {
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [ready, setReady] = useState(false)
  // bumps when the theme flips, so the sync below re-colours the series
  const [theme, setTheme] = useState(0)

  // what the crosshair handler reads; refreshed every render so it never goes stale
  const live = useRef({ times: [] as number[], onHover })
  live.current = { times: (line ?? bars[0] ?? []).map((p) => p.time), onHover }

  // 1. Lifecycle: the imperative chart, created once.
  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    ;(async () => {
      const lw = await import('lightweight-charts')
      if (disposed || !box.current) return
      const made = createMosaicChart(lw, box.current, () => setTheme((n) => n + 1))
      made.chart.subscribeCrosshairMove((param) => {
        const hit = param.time ? live.current.times.find((t) => toChart(t) === param.time) : undefined
        live.current.onHover(hit ?? null)
      })
      chartRef.current = { lw, chart: made.chart, candles: made.candles, bars: [] }
      dispose = made.dispose
      setReady(true)
    })()
    return () => {
      disposed = true
      dispose()
      chartRef.current = null
    }
  }, [])

  // 2. Sync: series on demand, then data and colours.
  const framed = useRef('')
  useEffect(() => {
    const c = chartRef.current
    if (!c) return
    const p = palette()
    const { lw, chart } = c
    const linePane = 1
    const barPane = line ? 2 : 1

    if (line && !c.line) {
      c.line = chart.addSeries(
        lw.LineSeries,
        {
          lineWidth: 2,
          priceFormat: formatOf(lineFormat, percentDigits),
          priceLineVisible: false,
          crosshairMarkerRadius: 3,
        },
        linePane,
      )
      if (baseline !== undefined)
        c.base = c.line.createPriceLine({
          price: baseline,
          color: p.border,
          lineStyle: lw.LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: false,
        })
    }
    while (c.bars.length < bars.length)
      c.bars.push(
        chart.addSeries(
          lw.HistogramSeries,
          { priceFormat: formatOf(barFormat), priceLineVisible: false, lastValueVisible: false },
          barPane,
        ),
      )
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3)
    panes[1]?.setStretchFactor(2)
    panes[2]?.setStretchFactor(1)

    c.line?.applyOptions({ color: p.fg })
    c.base?.applyOptions({ color: p.border })
    if (candles.length) c.candles.applyOptions({ priceFormat: precisionFor(candles[candles.length - 1].close) })
    c.candles.setData(candles.map(toBar))
    c.line?.setData((line ?? []).map((r) => ({ time: toChart(r.time), value: r.value })))
    c.bars.forEach((series, i) =>
      series.setData(
        (bars[i] ?? []).map((b) => ({
          time: toChart(b.time),
          value: b.value,
          color: fade(b.tone === 'up' ? p.up : p.down, 0.6),
        })),
      ),
    )
    if (candles.length && (line?.length || bars[0]?.length) && framed.current !== frameKey) {
      chart.applyOptions({ timeScale: { timeVisible: BAR_MS[bar] < BAR_MS['1D'] } })
      chart.timeScale().fitContent()
      framed.current = frameKey
    }
  }, [ready, candles, line, bars, lineFormat, percentDigits, barFormat, baseline, theme, frameKey, bar])

  return (
    <div className="relative h-full min-h-0">
      <div ref={box} className="absolute inset-0" />
      {children}
    </div>
  )
}

/** The readout row over the chart's top-left. */
export const Readout = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none absolute top-1.5 left-2 z-10 flex flex-wrap gap-x-3 num text-[11px] text-muted-foreground">
    {children}
  </div>
)

/** Candles from `all` that fall inside the statistic's window, so price and the statistic start together. */
export const within = (all: Candle[] | undefined, from: number | undefined) =>
  from === undefined ? [] : (all ?? []).filter((k) => k.time >= from)
