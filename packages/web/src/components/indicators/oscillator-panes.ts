import type { Candle } from '@crypz/exchanges'
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType } from 'lightweight-charts'
import { precisionFor, toChart, withAlpha, type LW, type Palette } from '@/components/trade/chart-kit'
import { macd, stochastic } from '@/lib/indicators/oscillators'
import { indicators, macdLengths } from '@/lib/indicators/store'
import { attachPaneLayer, type Layer } from './pane-layer'

// MACD and the stochastic oscillator, each in a pane of its own under the price. They are chart series on the
// library's own panes, so panning, zooming, the crosshair and timeframe changes keep them in step with the candles
// with no drawing code of ours. A pane exists only while its indicator is on and is removed when it is turned off.
// Values come from `lib/indicators/oscillators.ts`, which only ever looks backwards, so in replay they show only
// what the revealed candles can know.

/** The price pane is this many times the height of one oscillator pane. */
const PRICE_STRETCH = 3
const BAND = [20, 80] as const
const HIST_ALPHA = 0.8
/** Lines are two pixels: a hairline vanishes on a light page. The second line of each is dashed so the two differ in
 * style as well as shade. */
const LINE_WIDTH = 2
/** How much ink the pane's backdrop carries: the whole pane, the stretched zones inside it, the band lines. */
const TINT = 0.05
const ZONE = 0.1
const BAND_LINE = 0.6

type Panel = {
  series: ISeriesApi<SeriesType>[]
  /** Draws the pane's backdrop (tint, zones, zero line); moved with the palette. */
  backdrop: Layer
  /** Updates this panel's data and options from the candles and the current palette. */
  update: (candles: Candle[], p: Palette) => void
}

const points = (times: number[], values: number[]) =>
  values.flatMap((value, i) => (Number.isNaN(value) ? [] : [{ time: times[i] as never, value }]))

export function attachOscillators(opts: {
  lw: LW
  chart: IChartApi
  candles: () => Candle[]
  palette: Palette
}): Layer {
  const { lw, chart } = opts
  let p = opts.palette
  const panels: { macd: Panel | null; stoch: Panel | null } = { macd: null, stoch: null }

  const line = (color: string, pane: number, title: string, dashed = false) =>
    chart.addSeries(
      lw.LineSeries,
      {
        color,
        lineWidth: LINE_WIDTH,
        lineStyle: dashed ? lw.LineStyle.Dashed : lw.LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title,
      },
      pane,
    )

  /** Margins that let a pane's data fill it, instead of the library's roomy defaults. */
  const snug = (s: ISeriesApi<SeriesType>) => s.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })

  function createMacd(): Panel {
    const pane = chart.panes().length
    const hist = chart.addSeries(lw.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
    const fast = line(p.fg, pane, '')
    const slow = line(p.fg, pane, '', true)
    snug(fast)
    // a tinted pane so it reads as a panel, and a solid zero line to read the histogram and the crossings against
    const backdrop = attachPaneLayer(fast, 'bottom', p, (ctx, theme, size) => {
      ctx.fillStyle = withAlpha(theme.fg, TINT)
      ctx.fillRect(0, 0, size.width, size.height)
      const zero = fast.priceToCoordinate(0)
      if (zero === null || zero < 0 || zero > size.height) return
      ctx.fillStyle = withAlpha(theme.fg, BAND_LINE)
      ctx.fillRect(0, Math.round(zero), size.width, 1)
    })
    return {
      series: [hist, fast, slow],
      backdrop,
      update(candles, theme) {
        const { fast: f, slow: s, signal: g } = macdLengths(indicators.get().macd.preset)
        const m = macd(candles, f, s, g)
        const times = candles.map((k) => toChart(k.time))
        // the line is a fraction of a percent of price: size the axis labels to it
        const price = precisionFor((candles.at(-1)?.close ?? 1) * 0.002)
        hist.applyOptions({ priceFormat: price })
        hist.setData(
          m.hist.flatMap((value, i) =>
            Number.isNaN(value)
              ? []
              : [{ time: times[i] as never, value, color: withAlpha(value >= 0 ? theme.up : theme.down, HIST_ALPHA) }],
          ),
        )
        fast.applyOptions({ color: theme.fg, title: `MACD ${f}/${s}`, priceFormat: price })
        fast.setData(points(times, m.macd))
        slow.applyOptions({ color: theme.fg, title: `Signal ${g}`, priceFormat: price })
        slow.setData(points(times, m.signal))
        backdrop.refresh(theme)
      },
    }
  }

  function createStoch(): Panel {
    const pane = chart.panes().length
    const k = line(p.fg, pane, '')
    const d = line(p.fg, pane, '', true)
    // 0 to 100 whatever has printed, so the bands always sit in the same place, and the pane is filled by it
    k.applyOptions({
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    })
    d.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } })
    snug(k)
    const bands: IPriceLine[] = BAND.map((price) =>
      k.createPriceLine({
        price,
        color: withAlpha(p.fg, BAND_LINE),
        lineWidth: 1,
        lineStyle: lw.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      }),
    )
    // the pane tinted, with the stretched zones (above 80, below 20) a shade darker and a faint middle line
    const backdrop = attachPaneLayer(k, 'bottom', p, (ctx, theme, size) => {
      ctx.fillStyle = withAlpha(theme.fg, TINT)
      ctx.fillRect(0, 0, size.width, size.height)
      const [y0, y20, y50, y80, y100] = [0, 20, 50, 80, 100].map((v) => k.priceToCoordinate(v))
      ctx.fillStyle = withAlpha(theme.fg, ZONE)
      if (y100 !== null && y80 !== null) ctx.fillRect(0, y100, size.width, y80 - y100)
      if (y20 !== null && y0 !== null) ctx.fillRect(0, y20, size.width, y0 - y20)
      if (y50 !== null) {
        ctx.fillStyle = withAlpha(theme.fg, 0.2)
        ctx.fillRect(0, Math.round(y50), size.width, 1)
      }
    })
    return {
      series: [k, d],
      backdrop,
      update(candles, theme) {
        const { length, smooth, d: dSmooth } = indicators.get().stoch
        const s = stochastic(candles, length, smooth, dSmooth)
        const times = candles.map((c) => toChart(c.time))
        k.applyOptions({ color: theme.fg, title: `%K ${length}/${smooth}` })
        k.setData(points(times, s.k))
        d.applyOptions({ color: theme.fg, title: `%D ${dSmooth}` })
        d.setData(points(times, s.d))
        for (const b of bands) b.applyOptions({ color: withAlpha(theme.fg, BAND_LINE) })
        backdrop.refresh(theme)
      },
    }
  }

  const destroy = (key: 'macd' | 'stoch') => {
    const panel = panels[key]
    if (!panel) return
    panels[key] = null
    panel.backdrop.dispose()
    for (const s of panel.series) chart.removeSeries(s)
    // the series' pane is now empty; the library may or may not have dropped it, so check rather than assume
    const all = chart.panes()
    for (let i = all.length - 1; i > 0; i--) if (all[i].getSeries().length === 0) chart.removePane(i)
  }

  /** Bring the panes in line with the settings, then fill them. */
  const sync = () => {
    const s = indicators.get()
    if (s.macd.on && !panels.macd) panels.macd = createMacd()
    if (!s.macd.on) destroy('macd')
    if (s.stoch.on && !panels.stoch) panels.stoch = createStoch()
    if (!s.stoch.on) destroy('stoch')
    chart.panes().forEach((pane, i) => pane.setStretchFactor(i === 0 ? PRICE_STRETCH : 1))
    const candles = opts.candles()
    panels.macd?.update(candles, p)
    panels.stoch?.update(candles, p)
  }

  sync()
  const unsubscribe = indicators.subscribe(sync)
  return {
    refresh: (next) => {
      if (next) p = next
      sync()
    },
    dispose: () => {
      unsubscribe()
      destroy('macd')
      destroy('stoch')
    },
  }
}
