import type { Candle } from '@crypz/exchanges'
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType } from 'lightweight-charts'
import { precisionFor, toChart, withAlpha, type LW, type Palette } from '@/components/trade/chart-kit'
import { macd, stochastic } from '@/lib/indicators/oscillators'
import { indicators, macdLengths } from '@/lib/indicators/store'
import type { Layer } from './pane-layer'

// MACD and the stochastic oscillator, each in a pane of its own under the price. They are chart series on the
// library's own panes, so panning, zooming, the crosshair and timeframe changes keep them in step with the candles
// with no drawing code of ours. A pane exists only while its indicator is on and is removed when it is turned off.
// Values come from `lib/indicators/oscillators.ts`, which only ever looks backwards, so in replay they show only
// what the revealed candles can know.

/** The price pane is this many times the height of one oscillator pane. */
const PRICE_STRETCH = 3
const BAND = [20, 80] as const
const HIST_ALPHA = 0.55

type Panel = {
  series: ISeriesApi<SeriesType>[]
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

  const line = (color: string, pane: number, title: string) =>
    chart.addSeries(
      lw.LineSeries,
      { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title },
      pane,
    )

  function createMacd(): Panel {
    const pane = chart.panes().length
    const hist = chart.addSeries(lw.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane)
    const fast = line(p.fg, pane, '')
    const slow = line(p.muted, pane, '')
    return {
      series: [hist, fast, slow],
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
        slow.applyOptions({ color: theme.muted, title: `Signal ${g}`, priceFormat: price })
        slow.setData(points(times, m.signal))
      },
    }
  }

  function createStoch(): Panel {
    const pane = chart.panes().length
    const k = line(p.fg, pane, '')
    const d = line(p.muted, pane, '')
    // 0 to 100 whatever has printed, so the 20 and 80 bands always sit in the same place
    k.applyOptions({
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    })
    d.applyOptions({ priceFormat: { type: 'price', precision: 1, minMove: 0.1 } })
    const bands: IPriceLine[] = BAND.map((price) =>
      k.createPriceLine({
        price,
        color: withAlpha(p.muted, 0.6),
        lineWidth: 1,
        lineStyle: lw.LineStyle.Dashed,
        axisLabelVisible: false,
        title: '',
      }),
    )
    return {
      series: [k, d],
      update(candles, theme) {
        const { length, smooth, d: dSmooth } = indicators.get().stoch
        const s = stochastic(candles, length, smooth, dSmooth)
        const times = candles.map((c) => toChart(c.time))
        k.applyOptions({ color: theme.fg, title: `%K ${length}/${smooth}` })
        k.setData(points(times, s.k))
        d.applyOptions({ color: theme.muted, title: `%D ${dSmooth}` })
        d.setData(points(times, s.d))
        for (const b of bands) b.applyOptions({ color: withAlpha(theme.muted, 0.6) })
      },
    }
  }

  const destroy = (key: 'macd' | 'stoch') => {
    const panel = panels[key]
    if (!panel) return
    panels[key] = null
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
