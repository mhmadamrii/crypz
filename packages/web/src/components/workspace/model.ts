import type { WorkspaceStateT } from '@crypz/api'
import { DEFAULT_SYMBOL } from '@/lib/market'

// A workspace is a list of widgets, where each sits on a 24-column grid, and what each link group is watching.
// Widgets in the same link group follow one symbol (like TradingView's link colours, numbered here: the world has
// no spare colours). An unlinked widget keeps its own symbol.

export type WorkspaceState = WorkspaceStateT
export type WidgetConfig = WorkspaceState['widgets'][number]
export type LinkGroup = 1 | 2 | 3
export type WidgetKind =
  | 'chart'
  | 'book'
  | 'trades'
  | 'stats'
  | 'depth'
  | 'cvd'
  | 'profile'
  | 'footprint'
  | 'oi'
  | 'longshort'
  | 'taker'
  | 'basis'
  | 'liquidations'

export const COLS = 24
export const ROW = 28
export const GAP = 8

export const newWidgetId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** The first workspace anyone gets: chart in the middle, order flow beside it, stats along the bottom. */
export const DEFAULT_STATE: WorkspaceState = {
  v: 1,
  links: { '1': DEFAULT_SYMBOL, '2': 'ETH-USDT-SWAP', '3': 'SOL-USDT-SWAP' },
  widgets: [
    { id: 'chart', kind: 'chart', link: 1, settings: { bar: '1H' } },
    { id: 'book', kind: 'book', link: 1, settings: { step: 0 } },
    { id: 'trades', kind: 'trades', link: 1 },
    { id: 'stats', kind: 'stats', link: 1 },
  ],
  layout: [
    { i: 'stats', x: 0, y: 0, w: 24, h: 3 },
    { i: 'chart', x: 0, y: 3, w: 14, h: 17 },
    { i: 'book', x: 14, y: 3, w: 5, h: 17 },
    { i: 'trades', x: 19, y: 3, w: 5, h: 17 },
  ],
}

/** The symbol a widget is showing: its link group's, or its own when unlinked. */
export const symbolOf = (w: WidgetConfig, s: WorkspaceState) =>
  w.link ? s.links[String(w.link) as '1' | '2' | '3'] : (w.symbol ?? DEFAULT_SYMBOL)
