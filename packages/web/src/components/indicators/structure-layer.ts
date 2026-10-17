import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Palette } from '@/components/trade/chart-kit'
import { marketStructure, type Structure } from '@/lib/indicators/structure'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// Market structure over the candles. Each break is a line from the broken swing to the candle that closed through
// it, in the direction it broke (up / down, as in order flow): dashed for a BOS, solid for a CHoCH, named at its
// middle. Swing labels (HH, LH, HL, LL) are muted ink just beyond the wick. The two swings still unbroken, where the
// next break would come from, are dotted ink lines running to the right edge.

const alpha = (rgba: string, a: number) => rgba.replace(/,\s*[\d.]+\)$/, `,${a})`)

export function attachStructureLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  palette: Palette
  font: string
}) {
  const { chart, series } = opts
  let memo: { candles: Candle[]; length: number; st: Structure } | null = null
  const structureOf = (candles: Candle[], length: number) => {
    if (memo?.candles !== candles || memo.length !== length)
      memo = { candles, length, st: marketStructure(candles, length) }
    return memo.st
  }

  return attachPaneLayer(series, 'top', opts.palette, (ctx, p) => {
    const s = indicators.get().structure
    const candles = opts.candles()
    if (!s.on || candles.length < s.length * 2 + 1) return
    const st = structureOf(candles, s.length)
    const width = chart.timeScale().width()
    const y = (price: number) => series.priceToCoordinate(price)
    const visible = (xa: number, xb: number) => xb >= 0 && xa <= width

    ctx.font = `10px ${opts.font}`
    ctx.lineWidth = 1

    // the levels the next break would come from
    ctx.setLineDash([1, 3])
    ctx.strokeStyle = alpha(p.fg, 0.4)
    for (const sw of [st.lastHigh, st.lastLow]) {
      if (!sw) continue
      const xa = opts.x(sw.time)
      const ya = y(sw.price)
      if (xa === null || ya === null || xa > width) continue
      const row = Math.round(ya) + 0.5
      ctx.beginPath()
      ctx.moveTo(xa, row)
      ctx.lineTo(width, row)
      ctx.stroke()
    }

    for (const b of st.breaks) {
      const xa = opts.x(b.from.time)
      const xb = opts.x(b.time)
      const ya = y(b.from.price)
      if (xa === null || xb === null || ya === null || !visible(xa, xb)) continue
      const hue = b.dir === 'up' ? p.up : p.down
      const row = Math.round(ya) + 0.5
      ctx.setLineDash(b.type === 'BOS' ? [4, 3] : [])
      ctx.strokeStyle = alpha(hue, 0.85)
      ctx.beginPath()
      ctx.moveTo(xa, row)
      ctx.lineTo(xb, row)
      ctx.stroke()
      // the name sits on the side the break came from: above a broken high, below a broken low
      ctx.fillStyle = hue
      ctx.textAlign = 'center'
      ctx.textBaseline = b.dir === 'up' ? 'bottom' : 'top'
      if (xb - xa > ctx.measureText(b.type).width + 6)
        ctx.fillText(b.type, (xa + xb) / 2, b.dir === 'up' ? row - 2 : row + 2)
    }
    ctx.setLineDash([])

    if (s.labels) {
      ctx.fillStyle = p.muted
      ctx.textAlign = 'center'
      for (const sw of st.swings) {
        if (!sw.label) continue
        const xs = opts.x(sw.time)
        const ys = y(sw.price)
        if (xs === null || ys === null || xs < -20 || xs > width + 20) continue
        ctx.textBaseline = sw.kind === 'high' ? 'bottom' : 'top'
        ctx.fillText(sw.label, xs, sw.kind === 'high' ? ys - 4 : ys + 4)
      }
    }
    ctx.textAlign = 'left'
  })
}
