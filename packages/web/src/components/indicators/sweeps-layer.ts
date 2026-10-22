import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { isPool, liquidityOf, type Sweep } from '@/lib/indicators/liquidity'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// Liquidity sweeps over the candles: a dotted ink line from the level's last swing to the candle that reached past
// it and closed back, and the name just beyond that candle's wick, above a sweep of highs and below a sweep of lows:
// "Sweep" for a lone swing, "Sweep 3" for a pool of that many touches. A candle that sweeps several levels on one
// side is named once, for the strongest.

const LINE = 0.6
/** Older sweeps beyond this many are left off. */
const MAX_SHOWN = 60

export function attachSweepsLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  palette: Palette
  font: string
}) {
  const { chart, series } = opts

  return attachPaneLayer(series, 'top', opts.palette, (ctx, p) => {
    const { sweeps: s, liquidity, structure } = indicators.get()
    const candles = opts.candles()
    if (!s.on || candles.length < structure.length * 2 + 1) return
    const all = liquidityOf(candles, { tolerance: liquidity.tolerance, swing: structure.length }).sweeps
    const shown = (s.swings ? all : all.filter((w) => isPool(w.level))).slice(-MAX_SHOWN)
    const width = chart.timeScale().width()
    ctx.font = `10px ${opts.font}`
    ctx.lineWidth = 1
    ctx.textAlign = 'center'

    // one name per candle and side: the strongest level it swept
    const named = new Map<string, Sweep>()
    for (const w of shown) {
      const key = `${w.time}|${w.side}`
      const prev = named.get(key)
      if (!prev || w.level.swings.length > prev.level.swings.length) named.set(key, w)
    }

    ctx.setLineDash([1, 3])
    ctx.strokeStyle = withAlpha(p.fg, LINE)
    for (const w of shown) {
      const last = w.level.swings[w.level.swings.length - 1]
      const xa = opts.x(last.time)
      const xb = opts.x(w.time)
      const y = series.priceToCoordinate(w.level.price)
      if (xa === null || xb === null || y === null || xb < 0 || xa > width) continue
      const row = Math.round(y) + 0.5
      ctx.beginPath()
      ctx.moveTo(xa, row)
      ctx.lineTo(xb, row)
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.fillStyle = p.fg
    for (const w of named.values()) {
      const xb = opts.x(w.time)
      const y = series.priceToCoordinate(w.extreme)
      if (xb === null || y === null || xb < -20 || xb > width + 20) continue
      ctx.textBaseline = w.side === 'high' ? 'bottom' : 'top'
      const n = w.level.swings.length
      ctx.fillText(n > 1 ? `Sweep ${n}` : 'Sweep', xb, w.side === 'high' ? y - 4 : y + 4)
    }
    ctx.textAlign = 'left'
  })
}
