import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { findGaps, type Gap } from '@/lib/indicators/fvg'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// Fair value gaps behind the candles. Direction carries up/down, as in order flow: a bullish gap is an up wash, a
// bearish one a down wash. The box starts at the gap's middle candle and runs right while any of it is open,
// shrinking to the part still open as price trades back in; a dotted line marks the gap's midpoint (its 50%,
// "consequent encroachment"). Filled gaps stop where they were filled and, when shown at all, fade to a trace.

const OPEN_FILL = 0.14
const OPEN_EDGE = 0.55
const FILLED_FILL = 0.05
/** Older gaps beyond this many are left off; an unfilled one from months back says little about this bar. */
const MAX_SHOWN = 60

export function attachFvgLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  palette: Palette
}) {
  const { chart, series } = opts
  // detection runs once per candle set and size setting, not once per frame
  let memo: { candles: Candle[]; minAtr: number; gaps: Gap[] } | null = null
  const gapsFor = (candles: Candle[], minAtr: number) => {
    if (memo?.candles !== candles || memo.minAtr !== minAtr) memo = { candles, minAtr, gaps: findGaps(candles, minAtr) }
    return memo.gaps
  }

  return attachPaneLayer(series, 'bottom', opts.palette, (ctx, p) => {
    const s = indicators.get().fvg
    const candles = opts.candles()
    if (!s.on || candles.length < 3) return
    const last = candles[candles.length - 1]
    const half = chart.timeScale().options().barSpacing / 2
    const width = chart.timeScale().width()

    const all = gapsFor(candles, s.minAtr)
    const shown = (s.showFilled ? all : all.filter((g) => g.filledAt === null)).slice(-MAX_SHOWN)
    for (const g of shown) {
      const filled = g.filledAt !== null
      const xa = opts.x(g.start)
      const xb = opts.x(filled ? g.filledAt! : last.time)
      if (xa === null || xb === null) continue
      const left = Math.round(xa - half)
      const right = Math.round(xb + half)
      if (right < 0 || left > width) continue
      const hue = g.side === 'bull' ? p.up : p.down
      // a filled gap keeps its original zone as a trace; an open one shows only what is still open
      const top = filled ? g.top : g.openTop
      const bottom = filled ? g.bottom : g.openBottom
      const ya = series.priceToCoordinate(top)
      const yb = series.priceToCoordinate(bottom)
      if (ya === null || yb === null) continue
      const y = Math.round(Math.min(ya, yb))
      const h = Math.max(1, Math.round(Math.abs(yb - ya)))

      ctx.fillStyle = withAlpha(hue, filled ? FILLED_FILL : OPEN_FILL)
      ctx.fillRect(left, y, right - left, h)
      if (filled) continue
      // the open edge, the one price would reach first, gets a hairline; the midpoint is dotted
      ctx.strokeStyle = withAlpha(hue, OPEN_EDGE)
      ctx.lineWidth = 1
      ctx.setLineDash([])
      const edge = Math.round(g.side === 'bull' ? Math.min(ya, yb) : Math.max(ya, yb)) + 0.5
      ctx.beginPath()
      ctx.moveTo(left, edge)
      ctx.lineTo(right, edge)
      ctx.stroke()
      const mid = series.priceToCoordinate((g.top + g.bottom) / 2)
      if (mid !== null && h > 6) {
        ctx.setLineDash([1, 3])
        ctx.beginPath()
        ctx.moveTo(left, Math.round(mid) + 0.5)
        ctx.lineTo(right, Math.round(mid) + 0.5)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  })
}
