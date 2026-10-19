import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Palette } from '@/components/trade/chart-kit'
import { findZones, type Zone } from '@/lib/indicators/order-blocks'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// Order blocks behind the candles: a box over the base candle's range, running right while the zone is live.
// Direction carries up/down, as in order flow (demand up, supply down). Unlike a fair value gap's open-ended wash,
// a zone is a closed rectangle: solid edges while fresh, dashed once price has tapped it, and named "OB" at its
// left ("OB tapped" after the first tap). Spent zones stop where they were spent and, when shown, fade to a trace.

const FRESH_FILL = 0.12
const TAPPED_FILL = 0.07
const SPENT_FILL = 0.04
const EDGE = 0.6
/** Older zones beyond this many are left off. */
const MAX_SHOWN = 40

const alpha = (rgba: string, a: number) => rgba.replace(/,\s*[\d.]+\)$/, `,${a})`)

export function attachOrderBlocksLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  candles: () => Candle[]
  palette: Palette
  font: string
}) {
  const { chart, series } = opts
  // detection runs once per candle set and settings, not once per frame
  let memo: { candles: Candle[]; key: string; zones: Zone[] } | null = null
  const zonesFor = (candles: Candle[]) => {
    const { orderBlocks: o, structure } = indicators.get()
    const key = `${o.strength}|${o.imbalance}|${o.withTrend}|${structure.length}`
    if (memo?.candles !== candles || memo.key !== key)
      memo = {
        candles,
        key,
        zones: findZones(candles, {
          strength: o.strength,
          imbalance: o.imbalance,
          withTrend: o.withTrend,
          swing: structure.length,
        }),
      }
    return memo.zones
  }

  return attachPaneLayer(series, 'bottom', opts.palette, (ctx, p) => {
    const s = indicators.get().orderBlocks
    const candles = opts.candles()
    if (!s.on || candles.length < 3) return
    const last = candles[candles.length - 1]
    const half = chart.timeScale().options().barSpacing / 2
    const width = chart.timeScale().width()
    ctx.font = `10px ${opts.font}`
    ctx.lineWidth = 1

    const all = zonesFor(candles)
    const shown = (s.showSpent ? all : all.filter((z) => z.spentAt === null)).slice(-MAX_SHOWN)
    for (const z of shown) {
      const spent = z.spentAt !== null
      const xa = opts.x(z.start)
      const xb = opts.x(spent ? z.spentAt! : last.time)
      const ya = series.priceToCoordinate(z.top)
      const yb = series.priceToCoordinate(z.bottom)
      if (xa === null || xb === null || ya === null || yb === null) continue
      const left = Math.round(xa - half)
      const right = Math.round(xb + half)
      if (right < 0 || left > width) continue
      const top = Math.round(Math.min(ya, yb))
      const h = Math.max(1, Math.round(Math.abs(yb - ya)))
      const hue = z.side === 'demand' ? p.up : p.down

      ctx.fillStyle = alpha(hue, spent ? SPENT_FILL : z.taps ? TAPPED_FILL : FRESH_FILL)
      ctx.fillRect(left, top, right - left, h)
      if (spent) continue
      ctx.strokeStyle = alpha(hue, EDGE)
      ctx.setLineDash(z.taps ? [4, 3] : [])
      ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, h - 1)
      ctx.setLineDash([])
      if (h >= 12 && right - left > 28) {
        ctx.fillStyle = hue
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(z.taps ? 'OB tapped' : 'OB', left + 4, top + 2)
      }
    }
  })
}
