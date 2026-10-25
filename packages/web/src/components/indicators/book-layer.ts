import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { bookState, LevelTracker, visibleLevels, type BookLevel, type Instrument } from '@/lib/book'
import { fmtPrice, fmtUsd } from '@/lib/format'
import { indicators } from '@/lib/indicators/store'
import { bookFeed, okxConnection, type Book, type Store } from '@/lib/okx-ws'
import { attachPaneLayer, type Layer } from './pane-layer'

// OKX liquidity: the resting limit orders in OKX's live order book. Two looks, one data set.
//
// Lines (default): each significant level is a horizontal line that starts at the candle it first appeared at and
// runs right until it leaves, so walls read as lines across the chart; bids under the market in up, asks above in
// down, thicker and stronger for bigger size. A level that went (pulled, traded through, or shrunk under the
// threshold) stops where it did and fades, when kept.
// Bars: a profile of the book as it is now, at the right edge, each level a bar reaching left in proportion to size.
//
// Either way this is what is resting on the book, not what traded, and orders can be pulled at any moment. OKX
// keeps no book history, so a line can only start from when this browser began watching: nothing is invented
// before that. Nothing is drawn while the book cannot be trusted (loading, offline, silent too long); a short status
// line says why, so an old book never passes for the current one.

const REACH = 0.3 // bars: the biggest level reaches this share of the pane's width
const BAR_FILL = [0.1, 0.5] as const // bars: fill opacity from the smallest to the biggest level
const LINE_ALPHA = [0.2, 0.8] as const // lines: opacity from the smallest to the biggest level
const ENDED_FADE = 0.45 // lines: how much of its strength a level that went keeps
const LINE_PX = [1, 5] as const // lines: thickness from the smallest to the biggest level
const LABELLED = 5 // labels on the biggest this many per side

const STATUS = {
  loading: 'loading the book…',
  disconnected: 'offline, last book hidden',
  stale: 'no update for over a minute, hidden',
} as const

export type BookLayer = Layer & {
  /** What the chart is showing now. `failed` is a spec that could not be loaded; null spec otherwise means loading. */
  setInstrument: (id: string, spec: Instrument | null, failed?: boolean) => void
}

export function attachBookLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  /** Time (ms) → pixel on the chart's time axis, extended past the last candle. */
  x: (time: number) => number | null
  palette: Palette
  font: string
  /** The seams for tests; the app uses the shared OKX feed and the real clock. */
  feed?: (instId: string) => Store<Book>
  connection?: Pick<typeof okxConnection, 'get' | 'subscribe'>
  now?: () => number
}): BookLayer {
  const { series, font } = opts
  const feed = opts.feed ?? bookFeed
  const connection = opts.connection ?? okxConnection
  const now = opts.now ?? Date.now

  let id = ''
  let spec: Instrument | null = null
  let specFailed = false
  let live: { id: string; store: Store<Book>; stop: () => void } | null = null
  let clock: ReturnType<typeof setInterval> | undefined
  const tracker = new LevelTracker()
  /** When the book was last seen live, so a gap ends its lines there and not later. */
  let lastLive = 0
  let settingsKey = ''

  // sizing the same book at the same settings is the same result: pan and zoom redraw without recomputing it
  let memo: { book: Book; spec: Instrument; key: string; out: ReturnType<typeof visibleLevels> } | null = null

  /** What can be shown now: the levels, or the reason there are none. `live` is whether the book itself is current. */
  const current = ():
    | { say: string; live: false }
    | { say: string; live: true; book: Book }
    | { say: null; live: true; book: Book; view: NonNullable<ReturnType<typeof visibleLevels>> } => {
    const s = indicators.get().book
    if (specFailed) return { say: `could not load ${id}`, live: false }
    const book = live?.store.get()
    if (!book) return { say: STATUS.loading, live: false }
    if (book.error) return { say: `OKX refused ${id}`, live: false }
    const state = bookState(book, connection.get(), now())
    if (state !== 'live') return { say: STATUS[state], live: false }
    if (!spec) return { say: STATUS.loading, live: false }
    const key = `${s.sides}:${s.range}:${s.minShare}:${s.maxLevels}:${s.group}`
    if (!memo || memo.book !== book || memo.spec !== spec || memo.key !== key)
      memo = { book, spec, key, out: visibleLevels(book.bids, book.asks, spec, s) }
    if (!memo.out) return { say: 'empty book', live: true, book }
    if (!memo.out.levels.length) return { say: 'nothing in range', live: true, book }
    return { say: null, live: true, book, view: memo.out }
  }

  /** Follow the levels from this update to the next. Called whenever the book, the connection or the clock moves. */
  const observe = () => {
    const c = current()
    if (!c.live) {
      if (lastLive) tracker.endAll(lastLive)
      lastLive = 0
      return
    }
    lastLive = c.book.at
    if (c.say === null) tracker.update(c.view.levels, c.view.step, c.book.at)
    else tracker.endAll(c.book.at)
  }

  // Subscribe to the book only while the indicator is on, so it costs no connection when it is off. Staleness is
  // time passing with no message, so a slow tick re-checks and redraws it.
  const sync = () => {
    const s = indicators.get().book
    const key = `${s.sides}:${s.range}:${s.minShare}:${s.maxLevels}:${s.group}`
    if (key !== settingsKey) {
      settingsKey = key
      tracker.reset() // lines chosen under other settings would be a different set of levels
    }
    const want = s.on && id !== ''
    if (live && (!want || live.id !== id)) {
      live.stop()
      live = null
      clearInterval(clock)
      tracker.reset()
      lastLive = 0
    }
    if (want && !live) {
      const store = feed(id)
      const update = () => {
        observe()
        layer.refresh()
      }
      const stops = [store.subscribe(update), connection.subscribe(update)]
      live = { id, store, stop: () => stops.forEach((s) => s()) }
      clock = setInterval(update, 1000)
      observe() // a book already on the store starts its lines now, not at its next update
    }
  }

  const layer = attachPaneLayer(series, 'bottom', opts.palette, (ctx, p, size) => {
    const s = indicators.get().book
    if (!s.on) return
    const c = current()
    if (c.say !== null) {
      ctx.font = `10px ${font}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = p.muted
      ctx.fillText(`OKX liquidity · ${c.say}`, size.width - 6, 6)
      ctx.textAlign = 'left'
      // lines already earned stay until they ended; they are history, not the current book
      if (s.style === 'bars' || !s.ended) return
    }
    ctx.font = `10px ${font}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    if (s.style === 'bars') {
      if (c.say === null) drawBars(ctx, p, size, c.view.levels, c.view.step, s.labels)
    } else drawLines(ctx, p, size, s.ended, s.labels)
    ctx.textAlign = 'left'
  })

  const drawBars = (
    ctx: CanvasRenderingContext2D,
    p: Palette,
    size: { width: number; height: number },
    levels: BookLevel[],
    step: number,
    labels: boolean,
  ) => {
    const max = Math.max(...levels.map((l) => l.notional))
    const labelled = biggest(levels, labels)
    for (const l of levels) {
      // a bid bucket spans [px, px + step], an ask bucket [px − step, px]
      const a = series.priceToCoordinate(l.px)
      const b = series.priceToCoordinate(l.side === 'bid' ? l.px + step : l.px - step)
      if (a === null || b === null) continue
      const top = Math.min(a, b)
      const height = Math.max(2, Math.abs(a - b) - 1)
      if (top + height < 0 || top > size.height) continue
      const share = l.notional / max
      const w = Math.max(2, size.width * REACH * share)
      ctx.fillStyle = withAlpha(l.side === 'bid' ? p.up : p.down, BAR_FILL[0] + (BAR_FILL[1] - BAR_FILL[0]) * share)
      ctx.fillRect(size.width - w, Math.round(top), w, height)
      if (labelled.has(l)) {
        ctx.fillStyle = p.fg
        ctx.fillText(`${fmtPrice(l.px)} · ${fmtUsd(l.notional)}`, size.width - w - 4, Math.round(top + height / 2))
      }
    }
  }

  const drawLines = (
    ctx: CanvasRenderingContext2D,
    p: Palette,
    size: { width: number; height: number },
    ended: boolean,
    labels: boolean,
  ) => {
    const tracks = tracker.tracks().filter((t) => ended || t.end === null)
    if (!tracks.length) return
    const max = Math.max(...tracks.map((t) => t.peak))
    for (const t of tracks) {
      const open = t.end === null
      const xa = opts.x(t.start)
      const xb = open ? size.width : opts.x(t.end!)
      const y = series.priceToCoordinate(t.at)
      if (xa === null || xb === null || y === null || xb < 0 || xa > size.width || y < 0 || y > size.height) continue
      const share = (open ? t.notional : t.peak) / max
      const thick = LINE_PX[0] + (LINE_PX[1] - LINE_PX[0]) * share
      const alpha = (LINE_ALPHA[0] + (LINE_ALPHA[1] - LINE_ALPHA[0]) * share) * (open ? 1 : ENDED_FADE)
      const left = Math.max(0, xa)
      ctx.fillStyle = withAlpha(t.side === 'bid' ? p.up : p.down, alpha)
      ctx.fillRect(left, Math.round(y - thick / 2), Math.min(xb, size.width) - left, thick)
    }
    if (!labels) return
    // only the biggest of what is on the book now carry a label, at the right edge above their line
    const now = tracks.filter((t) => t.end === null)
    ctx.fillStyle = p.fg
    ctx.textBaseline = 'bottom'
    for (const side of ['bid', 'ask'] as const)
      now
        .filter((t) => t.side === side)
        .sort((a, b) => b.notional - a.notional)
        .slice(0, LABELLED)
        .forEach((t) => {
          const y = series.priceToCoordinate(t.at)
          if (y !== null && y >= 0 && y <= size.height)
            ctx.fillText(fmtUsd(t.notional), size.width - 4, Math.round(y) - 3)
        })
  }

  const biggest = (levels: BookLevel[], on: boolean) => {
    const out = new Set<BookLevel>()
    if (on)
      for (const side of ['bid', 'ask'] as const)
        levels
          .filter((l) => l.side === side)
          .sort((a, b) => b.notional - a.notional)
          .slice(0, LABELLED)
          .forEach((l) => out.add(l))
    return out
  }

  const unsubscribe = indicators.subscribe(sync)
  return {
    refresh: layer.refresh,
    setInstrument: (next, nextSpec, failed = false) => {
      if (next !== id) {
        tracker.reset()
        lastLive = 0
      }
      id = next
      spec = nextSpec
      specFailed = failed
      sync()
      layer.refresh()
    },
    dispose: () => {
      unsubscribe()
      live?.stop()
      live = null
      clearInterval(clock)
      layer.dispose()
    },
  }
}
