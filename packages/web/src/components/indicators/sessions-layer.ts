import type { Candle } from '@crypz/exchanges'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'
import { sessionsBetween } from '@/lib/indicators/sessions'

// Trading sessions behind the candles: each one a box from its open to its close, spanning the high and low traded
// inside it. Built from the candles the chart was given, so in replay a session's box grows bar by bar and never
// shows a high that has not happened yet. Each session has its own hue (violet Asia, blue London, lime New York) as
// a translucent wash with a stronger frame and label, so the three stay apart in either theme and where London and
// New York overlap the two washes mix instead of hiding each other.

const FILL = 0.13
const FRAME = 0.6

/** Sessions span hours; on bars this long or longer a session is one or two candles and the boxes stop reading. */
export const SESSION_MAX_BAR = 2 * 3_600_000

/** The OHLC readout's band at the top of the chart (two lines on a phone); a label above a box that high would sit under it. */
const LABEL_CLEAR = 44

/** Index of the first candle at or after `t`. */
function firstAtOrAfter(candles: Candle[], t: number) {
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (candles[mid].time < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function attachSessionsLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  /** Time → x for any instant, between bars and past the data (the drawing layer's mapper). */
  x: (time: number) => number | null
  candles: () => Candle[]
  barMs: () => number
  palette: Palette
  font: string
}) {
  const { chart, series } = opts
  return attachPaneLayer(series, 'bottom', opts.palette, (ctx, p) => {
    const s = indicators.get().sessions
    const candles = opts.candles()
    const barMs = opts.barMs()
    if (!s.on || !candles.length || barMs > SESSION_MAX_BAR) return

    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range) return
    const from = candles[Math.max(0, Math.floor(range.from))]?.time ?? candles[0].time
    const to = candles[Math.min(candles.length - 1, Math.ceil(range.to))]?.time ?? candles.at(-1)!.time
    const last = candles[candles.length - 1]
    // half a bar: a candle is drawn centred on its open time, so its slot starts half a bar earlier
    const half = chart.timeScale().options().barSpacing / 2

    ctx.font = `10px ${opts.font}`
    ctx.textBaseline = 'bottom'
    // labels already placed this frame, so a narrow view drops a label rather than stacking two
    const placed: { l: number; r: number; y: number }[] = []
    for (const span of sessionsBetween(from, to)) {
      if (!s[span.id]) continue
      const i0 = firstAtOrAfter(candles, span.start)
      const i1 = firstAtOrAfter(candles, span.end)
      if (i0 >= i1) continue
      let high = -Infinity
      let low = Infinity
      for (let i = i0; i < i1; i++) {
        high = Math.max(high, candles[i].high)
        low = Math.min(low, candles[i].low)
      }
      // a session still in progress stops at the newest revealed bar, not at its scheduled close
      const end = i1 < candles.length ? span.end : Math.min(span.end, last.time + barMs)
      const xa = opts.x(span.start)
      const xb = opts.x(end)
      const ya = series.priceToCoordinate(high)
      const yb = series.priceToCoordinate(low)
      if (xa === null || xb === null || ya === null || yb === null) continue
      const left = Math.round(xa - half)
      const right = Math.round(xb - half)
      const top = Math.round(ya)
      const height = Math.max(1, Math.round(yb - ya))

      const hue = p.session[span.id]
      ctx.fillStyle = withAlpha(hue, FILL)
      ctx.fillRect(left, top, right - left, height)
      ctx.strokeStyle = withAlpha(hue, FRAME)
      ctx.lineWidth = 1
      ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, height - 1)
      // above the box, or tucked inside it near the chart top where the OHLC readout lives
      const text = span.name.toUpperCase()
      const w = ctx.measureText(text).width
      const y = top - 2 < LABEL_CLEAR ? top + 13 : top - 2
      const free = !placed.some((q) => Math.abs(q.y - y) < 12 && left < q.r + 6 && left + w > q.l - 6)
      if (right - left >= w + 4 && free) {
        ctx.fillStyle = hue
        ctx.fillText(text, left + 2, y)
        placed.push({ l: left, r: left + w, y })
      }
    }
  })
}
