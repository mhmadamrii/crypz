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

/** Footprint row size, as a power of ten over the finest row (0 = finest; BTC: 1, 10, 100). */
export const FOOTPRINT_ROWS = [0, 1, 2] as const
export type FootprintRows = (typeof FOOTPRINT_ROWS)[number]

/** Absorption threshold in multiples of a bar's median row; 0 hides absorption. */
export const FOOTPRINT_ABSORB = [0, 2, 3, 5] as const
export type FootprintAbsorb = (typeof FOOTPRINT_ABSORB)[number]

/** Which size an imbalance weighs a row's side against: its diagonal neighbour, the same row, or none (off). */
export const FOOTPRINT_IMBALANCE = ['diagonal', 'row', 'off'] as const
export type FootprintImbalance = (typeof FOOTPRINT_IMBALANCE)[number]

/** How a footprint cell shows its size: sell and buy as two bars, or as one ink density (the row's volume). */
export const FOOTPRINT_CELLS = ['bars', 'volume'] as const
export type FootprintCells = (typeof FOOTPRINT_CELLS)[number]

export type IndicatorState = {
  sessions: { on: boolean } & Record<SessionId, boolean>
  fvg: { on: boolean; minAtr: FvgSize; showFilled: boolean }
  structure: { on: boolean; length: SwingLength; labels: boolean }
  bias: { on: boolean; higher: BiasFrame }
  orderBlocks: { on: boolean; strength: ObStrength; imbalance: boolean; withTrend: boolean; showSpent: boolean }
  footprint: {
    on: boolean
    rows: FootprintRows
    absorb: FootprintAbsorb
    cells: FootprintCells
    imbalance: FootprintImbalance
  }
}

const KEY = 'crypz.indicators.v1'
const DEFAULTS: IndicatorState = {
  sessions: { on: false, asia: true, london: true, newYork: true },
  fvg: { on: false, minAtr: 0.25, showFilled: false },
  structure: { on: false, length: 5, labels: true },
  bias: { on: false, higher: '4H' },
  orderBlocks: { on: false, strength: 1.5, imbalance: true, withTrend: false, showSpent: false },
  footprint: { on: false, rows: 1, absorb: 3, cells: 'bars', imbalance: 'diagonal' },
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
    const footprint = { ...DEFAULTS.footprint, ...saved.footprint }
    if (!FOOTPRINT_ROWS.includes(footprint.rows)) footprint.rows = DEFAULTS.footprint.rows
    if (!FOOTPRINT_ABSORB.includes(footprint.absorb)) footprint.absorb = DEFAULTS.footprint.absorb
    if (!FOOTPRINT_CELLS.includes(footprint.cells)) footprint.cells = DEFAULTS.footprint.cells
    if (!FOOTPRINT_IMBALANCE.includes(footprint.imbalance)) footprint.imbalance = DEFAULTS.footprint.imbalance
    return { sessions: { ...DEFAULTS.sessions, ...saved.sessions }, fvg, structure, bias, orderBlocks, footprint }
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
  setFootprint: (patch: Partial<IndicatorState['footprint']>) =>
    set({ ...get(), footprint: { ...get().footprint, ...patch } }),
}

/** How many indicators are on, for the toolbar button. */
export const activeCount = (s: IndicatorState) =>
  Number(s.sessions.on) +
  Number(s.fvg.on) +
  Number(s.structure.on) +
  Number(s.bias.on) +
  Number(s.orderBlocks.on) +
  Number(s.footprint.on)

export const useIndicators = () => useSyncExternalStore(indicators.subscribe, indicators.get, () => DEFAULTS)
