import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import type { Bias } from '@/lib/indicators/bias'
import { fmtPrice } from '@/lib/format'
import { attachPaneLayer } from './pane-layer'

// The bias's invalidation on the chart, so the user always sees where the idea dies: a solid line in the bias's
// direction (up for bullish, down for bearish) from the swing that defines it to the newest bar, labelled at its
// right end. A bias already broken keeps a dashed trace up to the candle that closed through it, marked there with
// a hollow square (the world's sign for a loss of standing).

export function attachBiasLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  bias: () => Bias | null
  palette: Palette
  font: string
}) {
  const { chart, series } = opts
  return attachPaneLayer(series, 'top', opts.palette, (ctx, p, size) => {
    const b = opts.bias()
    const last = opts.candles().at(-1)
    if (!b || !last) return
    const width = chart.timeScale().width()
    const half = chart.timeScale().options().barSpacing / 2
    ctx.font = `10px ${opts.font}`
    ctx.lineWidth = 1

    if (b.invalidated) {
      const v = b.invalidated
      const xa = opts.x(v.from)
      const xb = opts.x(v.at)
      const y = series.priceToCoordinate(v.price)
      if (xa !== null && xb !== null && y !== null && xb >= 0 && xa <= width) {
        const row = Math.round(y) + 0.5
        const hue = v.side === 'bull' ? p.up : p.down
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = withAlpha(hue, 0.5)
        ctx.beginPath()
        ctx.moveTo(xa, row)
        ctx.lineTo(xb, row)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.strokeStyle = hue
        ctx.strokeRect(Math.round(xb) - 3.5, row - 4, 7, 7)
        ctx.fillStyle = p.muted
        ctx.textAlign = 'left'
        ctx.textBaseline = v.side === 'bull' ? 'top' : 'bottom'
        ctx.fillText('Invalidated', Math.round(xb) + 6, v.side === 'bull' ? row + 3 : row - 3)
      }
    }

    if (b.invalidation && b.side) {
      const xa = opts.x(b.invalidation.from)
      const xb = opts.x(last.time)
      const y = series.priceToCoordinate(b.invalidation.price)
      if (xa === null || xb === null || y === null || xa > width) return
      const right = Math.min(width, xb + half + 24)
      const hue = b.side === 'bull' ? p.up : p.down
      const label = `Bias invalid · ${fmtPrice(b.invalidation.price)}`
      // off the visible price range: pin the label to that edge with a pointer toward the level
      if (y < 0 || y > size.height) {
        const down = y > size.height
        const edge = down ? size.height - 6 : 6
        ctx.fillStyle = hue
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, right - 12, edge)
        const tx = right - 4
        ctx.beginPath()
        ctx.moveTo(tx - 4, down ? edge - 2 : edge + 2)
        ctx.lineTo(tx + 4, down ? edge - 2 : edge + 2)
        ctx.lineTo(tx, down ? edge + 3 : edge - 3)
        ctx.closePath()
        ctx.fill()
        ctx.textAlign = 'left'
        return
      }
      const row = Math.round(y) + 0.5
      ctx.strokeStyle = withAlpha(hue, 0.9)
      ctx.beginPath()
      ctx.moveTo(Math.max(0, xa), row)
      ctx.lineTo(right, row)
      ctx.stroke()
      // the label sits on the far side from price: under a bullish level, over a bearish one
      ctx.fillStyle = hue
      ctx.textAlign = 'right'
      ctx.textBaseline = b.side === 'bull' ? 'top' : 'bottom'
      ctx.fillText(label, right, b.side === 'bull' ? row + 3 : row - 3)
      ctx.textAlign = 'left'
    }
  })
}
