import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { withAlpha, type Palette } from '@/components/trade/chart-kit'
import { bookState, visibleLevels, type BookLevel, type Instrument } from '@/lib/book'
import { fmtPrice, fmtUsd } from '@/lib/format'
import { indicators } from '@/lib/indicators/store'
import { bookFeed, okxConnection, type Book, type Store } from '@/lib/okx-ws'
import { attachPaneLayer, type Layer } from './pane-layer'

// OKX liquidity: the resting limit orders in the live order book, drawn at the right edge of the chart. Each level
// is a bar from its price, reaching left in proportion to its notional (bids under the market in up, asks above in
// down), so a wall reads at a glance. The biggest few carry a label. This is what is on the book right now, not
// what traded: it starts when the feed does, history is not invented, and orders can be pulled at any moment.
//
// It draws nothing while the book cannot be trusted (loading, offline, silent too long); a short status line says
// why, so an old book never passes for the current one.

const REACH = 0.3 // the biggest level reaches this share of the pane's width
const FILL = [0.1, 0.5] as const // fill opacity from the smallest to the biggest level
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

  // Subscribe to the book only while the indicator is on, so it costs no connection when it is off. Staleness is
  // time passing with no message, so a slow tick redraws it.
  const sync = () => {
    const want = indicators.get().book.on && id !== ''
    if (live && (!want || live.id !== id)) {
      live.stop()
      live = null
      clearInterval(clock)
    }
    if (want && !live) {
      const store = feed(id)
      const stops = [store.subscribe(() => layer.refresh()), connection.subscribe(() => layer.refresh())]
      live = { id, store, stop: () => stops.forEach((s) => s()) }
      clock = setInterval(() => layer.refresh(), 1000)
    }
  }

  // sizing the same book at the same settings is the same result: pan and zoom redraw without recomputing it
  let memo: { book: Book; spec: Instrument; key: string; out: ReturnType<typeof visibleLevels> } | null = null

  const layer = attachPaneLayer(series, 'bottom', opts.palette, (ctx, p, size) => {
    const s = indicators.get().book
    if (!s.on) return
    const say = (text: string) => {
      ctx.font = `10px ${font}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillStyle = p.muted
      ctx.fillText(`OKX liquidity · ${text}`, size.width - 6, 6)
      ctx.textAlign = 'left'
    }
    if (specFailed) return say(`could not load ${id}`)
    const book = live?.store.get()
    if (!book) return say(STATUS.loading)
    if (book.error) return say(`OKX refused ${id}`)
    const state = bookState(book, connection.get(), now())
    if (state !== 'live') return say(STATUS[state])
    if (!spec) return say(STATUS.loading)

    const key = `${s.sides}:${s.range}:${s.minShare}:${s.maxLevels}:${s.group}`
    if (!memo || memo.book !== book || memo.spec !== spec || memo.key !== key)
      memo = { book, spec, key, out: visibleLevels(book.bids, book.asks, spec, s) }
    const view = memo.out
    if (!view) return say('empty book')
    if (!view.levels.length) return say('nothing in range')

    const max = Math.max(...view.levels.map((l) => l.notional))
    const labelled = new Set<BookLevel>()
    if (s.labels)
      for (const side of ['bid', 'ask'] as const)
        view.levels
          .filter((l) => l.side === side)
          .sort((a, b) => b.notional - a.notional)
          .slice(0, LABELLED)
          .forEach((l) => labelled.add(l))

    ctx.font = `10px ${font}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const l of view.levels) {
      // a bid bucket spans [px, px + step], an ask bucket [px − step, px]
      const a = series.priceToCoordinate(l.px)
      const b = series.priceToCoordinate(l.side === 'bid' ? l.px + view.step : l.px - view.step)
      if (a === null || b === null) continue
      const top = Math.min(a, b)
      const height = Math.max(2, Math.abs(a - b) - 1)
      if (top + height < 0 || top > size.height) continue
      const share = l.notional / max
      const w = Math.max(2, size.width * REACH * share)
      ctx.fillStyle = withAlpha(l.side === 'bid' ? p.up : p.down, FILL[0] + (FILL[1] - FILL[0]) * share)
      ctx.fillRect(size.width - w, Math.round(top), w, height)
      if (labelled.has(l)) {
        ctx.fillStyle = p.fg
        ctx.fillText(`${fmtPrice(l.px)} · ${fmtUsd(l.notional)}`, size.width - w - 4, Math.round(top + height / 2))
      }
    }
    ctx.textAlign = 'left'
  })

  const unsubscribe = indicators.subscribe(sync)
  return {
    refresh: layer.refresh,
    setInstrument: (next, nextSpec, failed = false) => {
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
