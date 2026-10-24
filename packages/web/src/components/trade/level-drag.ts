import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { drawings } from '@/lib/drawings/store'
import type { OpenPosition } from '@/lib/replay'
import { withAlpha, type Palette } from './chart-kit'
import { attachPaneLayer } from '../indicators/pane-layer'

// Drag the open position's stop and target on the chart. A level that is set is dragged by its line; one that is
// not set yet shows an "SL" or "TP" chip beside the entry candle, and dragging that out sets it. The line follows
// the pointer, kept on the right side of the last price (a long's stop below it, its target above; a short's the
// other way round), and every move goes straight to `onLevel`, so the ticket and the lines always agree.

type Which = 'stop' | 'target'

const CHIP_W = 26
const CHIP_H = 16
const GAP = 6
/** How near the pointer must be to a level's line to grab it, in px. */
const GRAB = 5

export function attachLevelDrag(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  /** The chart box: pointer events are read here. */
  el: HTMLElement
  x: (time: number) => number | null
  position: () => OpenPosition | null
  /** The last price, which a level must stay on the right side of. */
  last: () => number | undefined
  onLevel: (which: Which, price: number) => void
  palette: Palette
  font: string
}) {
  const { chart, series, el } = opts
  let drag: Which | null = null
  let hover: Which | null = null

  /** The chips for levels not set yet, right of the entry candle (or at the pane's right edge when it scrolled off). */
  const chips = () => {
    const p = opts.position()
    if (!p) return []
    const y = series.priceToCoordinate(p.entry)
    if (y === null) return []
    const entryX = opts.x(p.entryTime)
    const width = chart.timeScale().width()
    const left =
      entryX !== null && entryX >= 0 && entryX <= width - 2 * CHIP_W - 3 * GAP
        ? entryX + GAP * 2
        : width - 2 * CHIP_W - 3 * GAP
    const out: { which: Which; x: number; y: number }[] = []
    let n = 0
    for (const which of ['stop', 'target'] as const)
      if (p[which] === null) out.push({ which, x: left + n++ * (CHIP_W + GAP), y: y - CHIP_H / 2 })
    return out
  }

  const hit = (x: number, y: number): Which | null => {
    const p = opts.position()
    if (!p) return null
    for (const c of chips()) if (x >= c.x && x <= c.x + CHIP_W && y >= c.y && y <= c.y + CHIP_H) return c.which
    if (x < 0 || x > chart.timeScale().width()) return null
    for (const which of ['stop', 'target'] as const) {
      const price = p[which]
      const ly = price === null ? null : series.priceToCoordinate(price)
      if (ly !== null && Math.abs(y - ly) <= GRAB) return which
    }
    return null
  }

  const layer = attachPaneLayer(series, 'top', opts.palette, (ctx, p) => {
    ctx.font = `10px ${opts.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1
    for (const c of chips()) {
      const hue = c.which === 'stop' ? p.down : p.up
      const x = Math.round(c.x)
      const y = Math.round(c.y)
      ctx.fillStyle = withAlpha(p.bg, 0.9)
      ctx.fillRect(x, y, CHIP_W, CHIP_H)
      ctx.strokeStyle = hue
      ctx.strokeRect(x + 0.5, y + 0.5, CHIP_W - 1, CHIP_H - 1)
      ctx.fillStyle = hue
      ctx.fillText(c.which === 'stop' ? 'SL' : 'TP', x + CHIP_W / 2, y + CHIP_H / 2 + 0.5)
    }
  })

  const local = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const setCursor = (on: boolean) => {
    el.style.cursor = on ? 'ns-resize' : ''
    el.toggleAttribute('data-cursor', on)
  }

  const onDown = (e: PointerEvent) => {
    // a drawing tool being armed means the pointer is drawing, not trading
    if (e.button !== 0 || drawings.get().tool !== 'cursor') return
    const { x, y } = local(e)
    const which = hit(x, y)
    if (!which) return
    drag = which
    // the chart must not pan under the drag
    chart.applyOptions({ handleScroll: { pressedMouseMove: false } })
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopImmediatePropagation()
    move(e)
  }

  const move = (e: PointerEvent) => {
    const p = opts.position()
    const last = opts.last()
    if (!drag || !p || last === undefined) return
    const price = series.coordinateToPrice(local(e).y)
    if (price === null) return
    // the nearest price the chart can show, so the line is never closer to the last price than one tick
    const { minMove } = series.options().priceFormat as { minMove: number }
    const long = p.side === 'long'
    const below = (drag === 'stop') === long
    const bound = below ? last - minMove : last + minMove
    const clamped = below ? Math.min(price, bound) : Math.max(price, bound)
    const decimals = Math.max(0, Math.round(-Math.log10(minMove)))
    opts.onLevel(drag, Number(clamped.toFixed(decimals)))
  }

  const onMove = (e: PointerEvent) => {
    if (drag) return move(e)
    if (e.buttons) return
    const { x, y } = local(e)
    const next = hit(x, y)
    if (next !== hover) {
      hover = next
      setCursor(!!next)
    }
  }

  const onUp = (e: PointerEvent) => {
    if (!drag) return
    drag = null
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    chart.applyOptions({ handleScroll: { pressedMouseMove: true } })
  }

  const onLeave = () => {
    if (hover && !drag) {
      hover = null
      setCursor(false)
    }
  }

  el.addEventListener('pointerdown', onDown, { capture: true })
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('pointerleave', onLeave)
  return {
    refresh: layer.refresh,
    dispose() {
      el.removeEventListener('pointerdown', onDown, { capture: true })
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onLeave)
      layer.dispose()
    },
  }
}
