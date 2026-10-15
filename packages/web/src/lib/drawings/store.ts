import { useSyncExternalStore } from 'react'
import type { Drawing, Tool } from './model'

// One store for the toolbar (React) and the chart layer (imperative). Drawings are kept per instrument in memory:
// they survive a new interval or start date, not a reload.

type State = {
  tool: Tool
  hidden: boolean
  selected: string | null
  bySymbol: Record<string, Drawing[]>
}

let state: State = { tool: 'cursor', hidden: false, selected: null, bySymbol: {} }
const listeners = new Set<() => void>()

const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  for (const fn of listeners) fn()
}

const list = (symbol: string) => state.bySymbol[symbol] ?? []
const put = (symbol: string, drawings: Drawing[], patch: Partial<State> = {}) =>
  set({ ...patch, bySymbol: { ...state.bySymbol, [symbol]: drawings } })

export const drawings = {
  get: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  list,
  setTool: (tool: Tool) => set({ tool, selected: tool === 'cursor' ? state.selected : null }),
  select: (selected: string | null) => set({ selected }),
  toggleHidden: () => set({ hidden: !state.hidden, selected: null }),
  /** Add a finished drawing, select it and fall back to the cursor (TradingView's default). */
  add: (symbol: string, d: Drawing) =>
    put(symbol, [...list(symbol), d], { selected: d.id, tool: 'cursor', hidden: false }),
  update: (symbol: string, d: Drawing) =>
    put(
      symbol,
      list(symbol).map((x) => (x.id === d.id ? d : x)),
    ),
  remove: (symbol: string, id: string) =>
    put(
      symbol,
      list(symbol).filter((x) => x.id !== id),
      { selected: state.selected === id ? null : state.selected },
    ),
  clear: (symbol: string) => put(symbol, [], { selected: null }),
}

export const useDrawings = () => useSyncExternalStore(drawings.subscribe, drawings.get, drawings.get)
