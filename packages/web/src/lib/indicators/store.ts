import { useSyncExternalStore } from 'react'
import type { SessionId } from './sessions'

// Which chart indicators are on. One store for the menu (React) and the chart layers (imperative), kept in this
// browser so the next replay opens with the same overlays. Storage can be missing or blocked; the defaults stand in.

export type IndicatorState = {
  sessions: { on: boolean } & Record<SessionId, boolean>
}

const KEY = 'crypz.indicators.v1'
const DEFAULTS: IndicatorState = { sessions: { on: false, asia: true, london: true, newYork: true } }

function load(): IndicatorState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<IndicatorState>
    return { sessions: { ...DEFAULTS.sessions, ...saved.sessions } }
  } catch {
    return DEFAULTS
  }
}

let state: IndicatorState | null = null
const listeners = new Set<() => void>()
const get = () => (state ??= load())

const set = (next: IndicatorState) => {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // private mode or blocked storage: the choice lasts for this tab only
  }
  for (const fn of listeners) fn()
}

export const indicators = {
  get,
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setSessions: (patch: Partial<IndicatorState['sessions']>) =>
    set({ ...get(), sessions: { ...get().sessions, ...patch } }),
}

/** How many indicators are on, for the toolbar button. */
export const activeCount = (s: IndicatorState) => (s.sessions.on ? 1 : 0)

export const useIndicators = () => useSyncExternalStore(indicators.subscribe, indicators.get, () => DEFAULTS)
