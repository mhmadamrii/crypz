import { useSyncExternalStore } from 'react'
import type { SessionId } from './sessions'

// Which chart indicators are on. One store for the menu (React) and the chart layers (imperative), kept in this
// browser so the next replay opens with the same overlays. Storage can be missing or blocked; the defaults stand in.

/** Minimum fair-value-gap size, in ATRs (0 = every gap). */
export const FVG_SIZES = [0, 0.25, 0.5, 1] as const
export type FvgSize = (typeof FVG_SIZES)[number]

/** How far an impulse must travel to make an order block, in ATRs. */
export const OB_STRENGTHS = [1, 1.5, 2, 3] as const
export type ObStrength = (typeof OB_STRENGTHS)[number]

/** Bars each side of a swing point. Longer swings are fewer and confirm later. */
export const SWING_LENGTHS = [3, 5, 10] as const
export type SwingLength = (typeof SWING_LENGTHS)[number]

/** Timeframes the bias can be read from. One at or below the chart's own falls back to the chart. */
export const BIAS_FRAMES = ['1H', '4H', '1D'] as const
export type BiasFrame = (typeof BIAS_FRAMES)[number]

export type IndicatorState = {
  sessions: { on: boolean } & Record<SessionId, boolean>
  fvg: { on: boolean; minAtr: FvgSize; showFilled: boolean }
  structure: { on: boolean; length: SwingLength; labels: boolean }
  bias: { on: boolean; higher: BiasFrame }
  orderBlocks: { on: boolean; strength: ObStrength; imbalance: boolean; withTrend: boolean; showSpent: boolean }
}

const KEY = 'crypz.indicators.v1'
const DEFAULTS: IndicatorState = {
  sessions: { on: false, asia: true, london: true, newYork: true },
  fvg: { on: false, minAtr: 0.25, showFilled: false },
  structure: { on: false, length: 5, labels: true },
  bias: { on: false, higher: '4H' },
  orderBlocks: { on: false, strength: 1.5, imbalance: true, withTrend: false, showSpent: false },
}

function load(): IndicatorState {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<IndicatorState>
    const fvg = { ...DEFAULTS.fvg, ...saved.fvg }
    if (!FVG_SIZES.includes(fvg.minAtr)) fvg.minAtr = DEFAULTS.fvg.minAtr
    const structure = { ...DEFAULTS.structure, ...saved.structure }
    if (!SWING_LENGTHS.includes(structure.length)) structure.length = DEFAULTS.structure.length
    const bias = { ...DEFAULTS.bias, ...saved.bias }
    if (!BIAS_FRAMES.includes(bias.higher)) bias.higher = DEFAULTS.bias.higher
    const orderBlocks = { ...DEFAULTS.orderBlocks, ...saved.orderBlocks }
    if (!OB_STRENGTHS.includes(orderBlocks.strength)) orderBlocks.strength = DEFAULTS.orderBlocks.strength
    return { sessions: { ...DEFAULTS.sessions, ...saved.sessions }, fvg, structure, bias, orderBlocks }
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
  setStructure: (patch: Partial<IndicatorState['structure']>) =>
    set({ ...get(), structure: { ...get().structure, ...patch } }),
  setBias: (patch: Partial<IndicatorState['bias']>) => set({ ...get(), bias: { ...get().bias, ...patch } }),
  setOrderBlocks: (patch: Partial<IndicatorState['orderBlocks']>) =>
    set({ ...get(), orderBlocks: { ...get().orderBlocks, ...patch } }),
}

/** How many indicators are on, for the toolbar button. */
export const activeCount = (s: IndicatorState) =>
  Number(s.sessions.on) + Number(s.fvg.on) + Number(s.structure.on) + Number(s.bias.on) + Number(s.orderBlocks.on)

export const useIndicators = () => useSyncExternalStore(indicators.subscribe, indicators.get, () => DEFAULTS)
