import type { Candle } from '@crypz/exchanges'
import { candleIndexAt } from '@/lib/candles'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'

// Shared setup for every lightweight-charts surface: colours from the world tokens, hollow candles, theme follow.

type LW = typeof import('lightweight-charts')

// lightweight-charts plots UTC; shift to the viewer's zone so axis labels read local time.
// The offset is taken at that moment, not today, so dates across a daylight-saving change still line up.
const tz = (ms: number) => -new Date(ms).getTimezoneOffset() * 60
export const toChart = (ms: number) => (Math.floor(ms / 1000) + tz(ms)) as UTCTimestamp

/** The viewer's zone as the chart shows it, e.g. "UTC+7 · Asia/Jakarta". */
export function zoneLabel(at = Date.now()) {
  const minutes = -new Date(at).getTimezoneOffset()
  const sign = minutes < 0 ? '−' : '+'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  const offset = minutes === 0 ? 'UTC' : `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
  const name = Intl.DateTimeFormat().resolvedOptions().timeZone
  return name && name !== 'UTC' ? `${offset} · ${name}` : offset
}

/** Resolve a CSS colour (incl. oklch / var()) to rgba via canvas, since the chart parses only basic formats. */
function resolveColor(expr: string, alpha = 1) {
  const probe = document.createElement('i')
  probe.style.color = expr
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = computed
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgba(${r},${g},${b},${alpha})`
}

/** The same colour at another opacity; `rgba` is one of the palette's `rgba(r,g,b,a)` strings. */
export const withAlpha = (rgba: string, a: number) => rgba.replace(/,\s*[\d.]+\)$/, `,${a})`)

/** The page's mono face, for canvas text and chart labels (canvas cannot read a CSS variable). */
export const monoFont = () => getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'

export function palette() {
  return {
    bg: resolveColor('var(--background)'),
    fg: resolveColor('var(--foreground)'),
    muted: resolveColor('var(--muted-foreground)'),
    hairline: resolveColor('var(--hairline)'),
    border: resolveColor('var(--border)'),
    up: resolveColor('var(--up)'),
    down: resolveColor('var(--down)'),
    session: {
      asia: resolveColor('var(--session-asia)'),
      london: resolveColor('var(--session-london)'),
      newYork: resolveColor('var(--session-ny)'),
    },
  }
}

export type Palette = ReturnType<typeof palette>

/** The chart time of the candle containing `ms` (the first candle for a time before them all). */
export const snapToChart = (candles: Candle[], ms: number) =>
  candles.length ? toChart(candles[candleIndexAt(candles, ms)].time) : toChart(ms)

export const toBar = (k: Candle) => ({ time: toChart(k.time), open: k.open, high: k.high, low: k.low, close: k.close })

/** Decimal places for the price scale, from the instrument's price level. */
export function precisionFor(price: number) {
  const precision = price >= 1000 ? 1 : price >= 10 ? 2 : price >= 1 ? 4 : 6
  return { type: 'price' as const, precision, minMove: 10 ** -precision }
}

function themed(lw: LW, p: Palette) {
  return {
    chart: {
      layout: {
        background: { type: lw.ColorType.Solid, color: p.bg },
        textColor: p.muted,
        panes: { separatorColor: p.border },
      },
      grid: { vertLines: { color: p.hairline }, horzLines: { color: p.hairline } },
      rightPriceScale: { borderColor: p.border },
      timeScale: { borderColor: p.border },
      crosshair: {
        vertLine: { color: p.muted, labelBackgroundColor: p.fg },
        horzLine: { color: p.muted, labelBackgroundColor: p.fg },
      },
    },
    // Hollow candles in the world's two inks: filled = close above open, hollow = below.
    candles: {
      upColor: p.fg,
      downColor: p.bg,
      borderUpColor: p.fg,
      borderDownColor: p.fg,
      wickUpColor: p.fg,
      wickDownColor: p.fg,
    },
  }
}

/** Create the chart + candle series, and keep both in step with the theme toggle. Call `dispose` on unmount. */
export function createMosaicChart(lw: LW, el: HTMLElement, onTheme?: (p: Palette) => void) {
  const p = palette()
  const t = themed(lw, p)
  const chart: IChartApi = lw.createChart(el, {
    autoSize: true,
    layout: {
      ...t.chart.layout,
      fontFamily: monoFont(),
      fontSize: 11,
      attributionLogo: true,
    },
    grid: t.chart.grid,
    rightPriceScale: t.chart.rightPriceScale,
    timeScale: { ...t.chart.timeScale, secondsVisible: false, rightOffset: 6 },
    crosshair: {
      mode: lw.CrosshairMode.Normal,
      vertLine: { ...t.chart.crosshair.vertLine, style: lw.LineStyle.Dotted },
      horzLine: { ...t.chart.crosshair.horzLine, style: lw.LineStyle.Dotted },
    },
  })
  const candles: ISeriesApi<'Candlestick'> = chart.addSeries(lw.CandlestickSeries, {
    ...t.candles,
    priceLineColor: p.muted,
    priceLineStyle: lw.LineStyle.Dashed,
  })
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } })

  const observer = new MutationObserver(() => {
    const q = palette()
    const next = themed(lw, q)
    chart.applyOptions(next.chart)
    candles.applyOptions(next.candles)
    onTheme?.(q)
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // Mouse wheel over the price axis zooms the price range around the price under the cursor (the library only
  // offers drag-to-scale there). Double-clicking the axis still snaps back to auto scale.
  const onWheel = (e: WheelEvent) => {
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const paneW = chart.timeScale().width()
    const scale = chart.priceScale('right')
    if (x < paneW || x > paneW + scale.width() || y > chart.paneSize(0).height) return
    const range = scale.getVisibleRange()
    const at = candles.coordinateToPrice(y)
    if (!range || at === null) return
    e.preventDefault()
    e.stopPropagation()
    // trackpads send many small deltas, wheels a few large ones; exp keeps both smooth and symmetric
    const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.0015)))
    scale.setAutoScale(false)
    scale.setVisibleRange({ from: at - (at - range.from) * f, to: at + (range.to - at) * f })
  }
  el.addEventListener('wheel', onWheel, { capture: true, passive: false })

  // Dragging the candles up or down frees the price axis from auto scale, like TradingView: the library only pans
  // price when auto scale is off, so a vertical drag would otherwise do nothing. Sideways drags keep auto scale.
  let press: { y: number } | null = null
  const onDown = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const inPane = e.clientX - r.left < chart.timeScale().width() && e.clientY - r.top < chart.paneSize(0).height
    press = e.button === 0 && inPane ? { y: e.clientY } : null
  }
  const onMove = (e: PointerEvent) => {
    if (!press || !(e.buttons & 1)) return
    const scroll = chart.options().handleScroll
    const panning = typeof scroll === 'boolean' ? scroll : scroll.pressedMouseMove
    const scale = chart.priceScale('right')
    // a drawing being dragged turns chart panning off; leave the axis alone then
    if (panning && scale.options().autoScale && Math.abs(e.clientY - press.y) > 4) scale.setAutoScale(false)
  }
  const onUp = () => (press = null)
  el.addEventListener('pointerdown', onDown, { capture: true })
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)

  return {
    chart,
    candles,
    dispose: () => {
      el.removeEventListener('wheel', onWheel, { capture: true })
      el.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      observer.disconnect()
      chart.remove()
    },
  }
}
