import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { isPool, liquidityOf } from '@/lib/indicators/liquidity'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// Liquidity pools over the candles: equal highs and equal lows as ink lines from their first swing, running right
// until price takes them. Each swing in the pool is a small square on the line; the line firms up with every touch.
// The name sits at the right edge, above a pool of highs and below a pool of lows: "EQH 3", "EQL 2". A taken pool,
// when shown, is a faint dashed line that stops where it was taken.

const TOUCH_ALPHA = [0, 0, 0.45, 0.65, 0.85] as const
const TAKEN_ALPHA = 0.3
const MARK = 3
/** Older pools beyond this many are left off. */
const MAX_SHOWN = 30

export function attachLiquidityLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  palette: Palette
  font: string
}) {
  const { chart, series } = opts

  return attachPaneLayer(series, 'top', opts.palette, (ctx, p) => {
    const { liquidity: s, structure } = indicators.get()
    const candles = opts.candles()
    if (!s.on || candles.length < structure.length * 2 + 1) return
    const { levels } = liquidityOf(candles, { tolerance: s.tolerance, swing: structure.length })
    const width = chart.timeScale().width()
    ctx.font = `10px ${opts.font}`
    ctx.lineWidth = 1
    ctx.textAlign = 'right'

    const pools = levels.filter((l) => isPool(l) && (s.showTaken || l.takenAt === null)).slice(-MAX_SHOWN)
    for (const l of pools) {
      const taken = l.takenAt !== null
      const xa = opts.x(l.start)
      const xb = taken ? opts.x(l.takenAt!) : width
      const ya = series.priceToCoordinate(l.price)
      if (xa === null || xb === null || ya === null || xb < 0 || xa > width) continue
      const row = Math.round(ya) + 0.5
      const alpha = taken ? TAKEN_ALPHA : TOUCH_ALPHA[Math.min(l.swings.length, TOUCH_ALPHA.length - 1)]
      ctx.setLineDash(taken ? [4, 3] : [])
      ctx.strokeStyle = withAlpha(p.fg, alpha)
      ctx.beginPath()
      ctx.moveTo(Math.max(xa, 0), row)
      ctx.lineTo(Math.min(xb, width), row)
      ctx.stroke()
      ctx.setLineDash([])
      if (taken) continue

      ctx.fillStyle = withAlpha(p.fg, alpha)
      for (const sw of l.swings) {
        const xs = opts.x(sw.time)
        if (xs !== null) ctx.fillRect(Math.round(xs - MARK / 2), Math.round(row - MARK / 2), MARK, MARK)
      }
      ctx.fillStyle = p.muted
      ctx.textBaseline = l.side === 'high' ? 'bottom' : 'top'
      ctx.fillText(
        `${l.side === 'high' ? 'EQH' : 'EQL'} ${l.swings.length}`,
        width - 4,
        l.side === 'high' ? row - 2 : row + 2,
      )
    }
    ctx.textAlign = 'left'
  })
}
