import type { Candle } from '@crypz/exchanges'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  Time,
} from 'lightweight-charts'
import type { Palette } from '@/components/trade/chart-kit'
import { drag, handles, hitTest, type Mapper } from '@/lib/drawings/geometry'
import { FIB_LEVELS, fibPrice, newId, positionStats, type Drawing, type Point } from '@/lib/drawings/model'
import { drawings as store } from '@/lib/drawings/store'
import { fmtPrice, fmtSigned } from '@/lib/format'

// The drawing layer for one chart: a series primitive renders every drawing inside the chart canvas, and a small
// pointer state machine on the chart box creates, selects, drags and deletes them.

type Ctx = CanvasRenderingContext2D

/** Time ↔ pixel through the bar index, extrapolated past the data so drawings can reach into empty space. */
export function createMapper(
  chart: IChartApi,
  series: ISeriesApi<'Candlestick'>,
  candles: () => Candle[],
  barMs: number,
) {
  const toLogical = (t: number) => {
    const c = candles()
    const n = c.length
    if (!n) return null
    if (t <= c[0].time) return (t - c[0].time) / barMs
    if (t >= c[n - 1].time) return n - 1 + (t - c[n - 1].time) / barMs
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (c[mid].time <= t) lo = mid
      else hi = mid
    }
    return lo + (t - c[lo].time) / (c[hi].time - c[lo].time)
  }
  const fromLogical = (l: number) => {
    const c = candles()
    const n = c.length
    if (!n) return null
    if (l <= 0) return c[0].time + l * barMs
    if (l >= n - 1) return c[n - 1].time + (l - (n - 1)) * barMs
    const i = Math.floor(l)
    return c[i].time + (l - i) * (c[i + 1].time - c[i].time)
  }
  const ts = chart.timeScale()
  return {
    x: (time) => {
      const l = toLogical(time)
      return l === null ? null : ts.logicalToCoordinate(l as Logical)
    },
    y: (price) => series.priceToCoordinate(price),
    point: (x, y) => {
      const l = ts.coordinateToLogical(x)
      const price = series.coordinateToPrice(y)
      const time = l === null ? null : fromLogical(l)
      return time === null || price === null ? null : { time, price }
    },
    /** `time` moved by `bars` bar widths. */
    shiftBars: (time: number, bars: number) => {
      const l = toLogical(time)
      return l === null ? time + bars * barMs : (fromLogical(l + bars) ?? time + bars * barMs)
    },
  } satisfies Mapper & { shiftBars: (time: number, bars: number) => number }
}

type DrawMapper = ReturnType<typeof createMapper>

const alpha = (rgba: string, a: number) => rgba.replace(/,\s*[\d.]+\)$/, `,${a})`)
const crisp = (v: number) => Math.round(v) + 0.5

type Look = { p: Palette; font: string }

function render(ctx: Ctx, d: Drawing, m: Mapper, look: Look, selected: boolean) {
  const { p } = look
  const pt = (q: Point) => {
    const x = m.x(q.time)
    const y = m.y(q.price)
    return x === null || y === null ? null : { x, y }
  }
  const line = (ax: number, ay: number, bx: number, by: number) => {
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.stroke()
  }
  ctx.font = `11px ${look.font}`
  ctx.textBaseline = 'middle'
  ctx.setLineDash([])

  switch (d.kind) {
    case 'trend': {
      const a = pt(d.a)
      const b = pt(d.b)
      if (!a || !b) return
      ctx.strokeStyle = p.fg
      ctx.lineWidth = 1.5
      line(a.x, a.y, b.x, b.y)
      break
    }
    case 'rect': {
      const a = pt(d.a)
      const b = pt(d.b)
      if (!a || !b) return
      const x = crisp(Math.min(a.x, b.x))
      const y = crisp(Math.min(a.y, b.y))
      const w = Math.round(Math.abs(b.x - a.x))
      const h = Math.round(Math.abs(b.y - a.y))
      ctx.fillStyle = alpha(p.fg, 0.07)
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = alpha(p.fg, 0.75)
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, w, h)
      break
    }
    case 'fib': {
      const a = pt(d.a)
      const b = pt(d.b)
      if (!a || !b) return
      const x1 = Math.min(a.x, b.x)
      const x2 = Math.max(a.x, b.x)
      ctx.lineWidth = 1
      ctx.strokeStyle = p.muted
      ctx.setLineDash([5, 5])
      line(a.x, a.y, b.x, b.y)
      ctx.setLineDash([])
      ctx.textAlign = 'right'
      for (const level of FIB_LEVELS) {
        const price = fibPrice(d, level)
        const y = m.y(price)
        if (y === null) continue
        // the edges (0, 1) and the extension recede; the retracement zone carries the ink
        const strong = level > 0 && level < 1
        ctx.strokeStyle = strong ? p.fg : p.muted
        ctx.fillStyle = strong ? p.fg : p.muted
        if (level < 0) ctx.setLineDash([2, 3])
        line(x1, crisp(y), x2, crisp(y))
        ctx.setLineDash([])
        ctx.fillText(`${level} (${fmtPrice(price)})`, x1 - 6, y)
      }
      break
    }
    case 'position': {
      const x1 = m.x(d.entry.time)
      const x2 = m.x(d.end)
      const ye = m.y(d.entry.price)
      const yt = m.y(d.target)
      const ys = m.y(d.stop)
      if (x1 === null || x2 === null || ye === null || yt === null || ys === null) return
      const left = Math.round(x1)
      const w = Math.max(1, Math.round(x2 - x1))
      ctx.fillStyle = alpha(p.up, 0.14)
      ctx.fillRect(left, Math.min(ye, yt), w, Math.abs(yt - ye))
      ctx.fillStyle = alpha(p.down, 0.14)
      ctx.fillRect(left, Math.min(ye, ys), w, Math.abs(ys - ye))
      ctx.strokeStyle = alpha(p.fg, 0.8)
      ctx.lineWidth = 1
      line(left, crisp(ye), left + w, crisp(ye))

      const s = positionStats(d)
      ctx.textAlign = 'left'
      const pad = 6
      const label = (text: string, y: number, color: string) => {
        ctx.fillStyle = color
        ctx.fillText(text, left + pad, y)
      }
      // leg labels sit just outside their zone, the entry label just inside the target zone
      const away = (edge: number) => edge + Math.sign(edge - ye) * 10
      label(`Target ${fmtPrice(d.target)}  ${fmtSigned(s.targetPct)}%`, away(yt), p.up)
      label(`Stop ${fmtPrice(d.stop)}  ${fmtSigned(s.stopPct)}%`, away(ys), p.down)
      label(
        `${d.side === 'long' ? 'Long' : 'Short'} ${fmtPrice(d.entry.price)}  R:R ${s.rr.toFixed(2)}`,
        ye + (yt < ye ? 10 : -10),
        p.fg,
      )
      break
    }
    case 'path': {
      const pts = d.points.map(pt).filter((q): q is { x: number; y: number } => q !== null)
      if (pts.length < 2) return
      ctx.strokeStyle = p.fg
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
      ctx.stroke()
      const [u, v] = pts.slice(-2)
      const ang = Math.atan2(v.y - u.y, v.x - u.x)
      if (Math.hypot(v.x - u.x, v.y - u.y) > 4)
        for (const da of [Math.PI * 0.85, -Math.PI * 0.85])
          line(v.x, v.y, v.x + 10 * Math.cos(ang + da), v.y + 10 * Math.sin(ang + da))
      break
    }
  }

  if (selected)
    for (const h of handles(d, m)) {
      ctx.fillStyle = p.bg
      ctx.strokeStyle = p.fg
      ctx.lineWidth = 1
      ctx.fillRect(Math.round(h.x) - 3, Math.round(h.y) - 3, 7, 7)
      ctx.strokeRect(crisp(h.x) - 4, crisp(h.y) - 4, 7, 7)
    }
}

type Drag = { id: string; part: string; p0: Point; d0: Drawing }
type Draft = { d: Drawing; stage: 'drag' | 'click'; downX: number; downY: number }

export function attachDrawingLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  el: HTMLElement
  symbol: string
  mapper: DrawMapper
  palette: Palette
}) {
  const { chart, series, el, symbol, mapper: m } = opts
  const look: Look = {
    p: opts.palette,
    font: getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace',
  }
  let draft: Draft | null = null
  let dragging: Drag | null = null
  let hover: { id: string; cursor: string } | null = null
  let requestUpdate = () => {}

  const primitive: ISeriesPrimitive<Time> = {
    attached: (param) => {
      requestUpdate = param.requestUpdate
    },
    detached: () => {
      requestUpdate = () => {}
    },
    paneViews: () => views,
  }
  const renderer: IPrimitivePaneRenderer = {
    draw: (target) =>
      target.useMediaCoordinateSpace(({ context }) => {
        const s = store.get()
        if (!s.hidden) for (const d of store.list(symbol)) render(context, d, m, look, d.id === s.selected)
        if (draft) render(context, draft.d, m, look, false)
      }),
  }
  const views: IPrimitivePaneView[] = [{ zOrder: () => 'top', renderer: () => renderer }]
  series.attachPrimitive(primitive)

  // Panning the chart stays on unless a drawing tool is armed or the pointer is on a drawing.
  let pan = true
  const sync = () => {
    const s = store.get()
    const next = s.tool === 'cursor' && !hover && !dragging && !draft
    if (next !== pan) {
      pan = next
      chart.applyOptions({ handleScroll: { pressedMouseMove: pan } })
    }
    // the box's cursor wins over the chart's own while set (see the data-cursor rule on the chart box)
    const cursor = s.tool !== 'cursor' || draft ? 'crosshair' : dragging ? 'grabbing' : (hover?.cursor ?? '')
    el.style.cursor = cursor
    el.toggleAttribute('data-cursor', !!cursor)
    requestUpdate()
  }
  const unsubscribe = store.subscribe(sync)

  const local = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const inPane = (x: number, y: number) =>
    x >= 0 && y >= 0 && x <= chart.timeScale().width() && y <= chart.paneSize(0).height

  const topHit = (x: number, y: number) => {
    const s = store.get()
    if (s.hidden) return null
    const list = store.list(symbol)
    // the selected drawing's handles win, then whatever was drawn last
    const order = [...list.filter((d) => d.id === s.selected), ...list.filter((d) => d.id !== s.selected).reverse()]
    for (const d of order) {
      const hit = hitTest(d, m, x, y, d.id === s.selected)
      if (hit) return { d, ...hit }
    }
    return null
  }

  const commit = (d: Drawing) => {
    draft = null
    store.add(symbol, d)
  }

  const finishPath = () => {
    if (!draft || draft.d.kind !== 'path') return
    // drop the trailing rubber-band point and any double-click duplicates
    const pts = draft.d.points.slice(0, -1).filter((q, i, all) => {
      if (!i) return true
      const a = m.x(all[i - 1].time)
      const b = m.x(q.time)
      const ya = m.y(all[i - 1].price)
      const yb = m.y(q.price)
      return a === null || b === null || ya === null || yb === null || Math.hypot(b - a, yb - ya) > 3
    })
    if (pts.length >= 2) commit({ ...draft.d, points: pts })
    else {
      draft = null
      store.setTool('cursor')
    }
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const { x, y } = local(e)
    if (!inPane(x, y)) return
    const p = m.point(x, y)
    if (!p) return
    const tool = store.get().tool

    if (tool === 'cursor') {
      const hit = topHit(x, y)
      store.select(hit ? hit.d.id : null)
      if (hit) {
        dragging = { id: hit.d.id, part: hit.part, p0: p, d0: hit.d }
        el.setPointerCapture(e.pointerId)
        e.preventDefault()
      }
      sync()
      return
    }

    e.preventDefault()
    if (tool === 'long' || tool === 'short') {
      // default legs: 6% of the visible price range to the stop, 2R to the target, 24 bars wide
      const top = series.coordinateToPrice(0)
      const bottom = series.coordinateToPrice(chart.paneSize(0).height)
      const risk = top !== null && bottom !== null ? Math.abs(top - bottom) * 0.06 : p.price * 0.01
      const up = tool === 'long' ? 1 : -1
      commit({
        id: newId(),
        kind: 'position',
        side: tool,
        entry: p,
        stop: p.price - up * risk,
        target: p.price + up * risk * 2,
        end: m.shiftBars(p.time, 24),
      })
      return
    }
    if (tool === 'path') {
      if (draft?.d.kind === 'path') draft.d = { ...draft.d, points: [...draft.d.points.slice(0, -1), p, p] }
      else draft = { d: { id: newId(), kind: 'path', points: [p, p] }, stage: 'click', downX: x, downY: y }
      sync()
      return
    }
    // two-point tools: drag out, or click and click again
    if (draft && draft.stage === 'click' && draft.d.kind !== 'path' && draft.d.kind !== 'position') {
      commit({ ...draft.d, b: p })
      return
    }
    draft = { d: { id: newId(), kind: tool, a: p, b: p }, stage: 'drag', downX: x, downY: y }
    el.setPointerCapture(e.pointerId)
    sync()
  }

  const onMove = (e: PointerEvent) => {
    const { x, y } = local(e)
    const p = m.point(x, y)
    if (dragging) {
      if (p) store.update(symbol, drag(dragging.d0, dragging.part, dragging.p0, p))
      return
    }
    if (draft) {
      if (!p) return
      const d = draft.d
      if (d.kind === 'path') draft.d = { ...d, points: [...d.points.slice(0, -1), p] }
      else if (d.kind !== 'position') draft.d = { ...d, b: p }
      requestUpdate()
      return
    }
    if (e.buttons) return // a chart pan is in progress
    const hit = inPane(x, y) && store.get().tool === 'cursor' ? topHit(x, y) : null
    const next = hit ? { id: hit.d.id, cursor: hit.cursor } : null
    if (next?.id !== hover?.id || next?.cursor !== hover?.cursor) {
      hover = next
      sync()
    }
  }

  const onUp = (e: PointerEvent) => {
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (dragging) {
      dragging = null
      sync()
      return
    }
    if (draft?.stage === 'drag') {
      const { x, y } = local(e)
      if (Math.hypot(x - draft.downX, y - draft.downY) > 4) commit(draft.d)
      else draft.stage = 'click'
      sync()
    }
  }

  const onDblClick = () => finishPath()
  const onLeave = () => {
    if (!hover) return
    hover = null
    sync()
  }

  const TOOL_KEYS: Record<string, Parameters<typeof store.setTool>[0]> = {
    KeyT: 'trend',
    KeyR: 'rect',
    KeyF: 'fib',
    KeyL: 'long',
    KeyS: 'short',
    KeyP: 'path',
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    if (e.altKey && !e.metaKey && !e.ctrlKey && TOOL_KEYS[e.code]) {
      e.preventDefault()
      draft = null
      store.setTool(TOOL_KEYS[e.code])
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const s = store.get()
    if (e.key === 'Enter' && draft?.d.kind === 'path') {
      e.preventDefault()
      finishPath()
    } else if (e.key === 'Escape') {
      if (draft?.d.kind === 'path') finishPath()
      else if (draft) draft = null
      if (s.tool !== 'cursor') store.setTool('cursor')
      else store.select(null)
      sync()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected) {
      e.preventDefault()
      store.remove(symbol, s.selected)
    }
  }

  el.addEventListener('pointerdown', onDown, { capture: true })
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('dblclick', onDblClick)
  el.addEventListener('pointerleave', onLeave)
  window.addEventListener('keydown', onKey)

  return {
    setPalette: (p: Palette) => {
      look.p = p
      requestUpdate()
    },
    dispose: () => {
      unsubscribe()
      el.removeEventListener('pointerdown', onDown, { capture: true })
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKey)
      series.detachPrimitive(primitive)
    },
  }
}
