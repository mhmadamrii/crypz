import { useSyncExternalStore } from 'react'
import type { SessionId } from './sessions'

// Which chart indicators are on. One store for the menu (React) and the chart layers (imperative), kept in this
// browser so the next replay opens with the same overlays. Storage can be missing or blocked; the defaults stand in.

/** Minimum fair-value-gap size, in ATRs (0 = every gap). */
export const FVG_SIZES = [0, 0.25, 0.5, 1] as const
export type FvgSize = (typeof FVG_SIZES)[number]

export type IndicatorState = {
  sessions: { on: boolean } & Record<SessionId, boolean>
  fvg: { on: boolean; minAtr: FvgSize; showFilled: boolean }
}

const KEY = 'crypz.indicators.v1'
const DEFAULTS: IndicatorState = {
  sessions: { on: false, asia: true, london: true, newYork: true },
  fvg: { on: false, minAtr: 0.25, showFilled: false },
}

function load(): IndicatorState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<IndicatorState>
    const fvg = { ...DEFAULTS.fvg, ...saved.fvg }
    if (!FVG_SIZES.includes(fvg.minAtr)) fvg.minAtr = DEFAULTS.fvg.minAtr
    return { sessions: { ...DEFAULTS.sessions, ...saved.sessions }, fvg }
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
  setFvg: (patch: Partial<IndicatorState['fvg']>) => set({ ...get(), fvg: { ...get().fvg, ...patch } }),
}

/** How many indicators are on, for the toolbar button. */
export const activeCount = (s: IndicatorState) => Number(s.sessions.on) + Number(s.fvg.on)

export const useIndicators = () => useSyncExternalStore(indicators.subscribe, indicators.get, () => DEFAULTS)
