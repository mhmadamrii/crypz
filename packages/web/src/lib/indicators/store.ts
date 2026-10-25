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

/** How close equal highs or lows must be to pool, and how far a wick must go to take one, in ATRs. */
export const LIQUIDITY_TOLERANCES = [0.05, 0.1, 0.2] as const
export type LiquidityTolerance = (typeof LIQUIDITY_TOLERANCES)[number]

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

/** Which sides of the OKX order book the liquidity indicator draws. */
export const BOOK_SIDES = ['both', 'bids', 'asks'] as const
export type BookSides = (typeof BOOK_SIDES)[number]

/** How far from the market it looks, as a fraction of price (0.02 = ±2%). */
export const BOOK_RANGES = [0.005, 0.01, 0.02, 0.05] as const
export type BookRange = (typeof BOOK_RANGES)[number]

/** Levels smaller than this share of the biggest visible one are hidden (0 = none), so the threshold fits any coin. */
export const BOOK_MIN_SHARES = [0, 0.1, 0.25, 0.5] as const
export type BookMinShare = (typeof BOOK_MIN_SHARES)[number]

/** The most levels drawn per side; the biggest win. */
export const BOOK_MAX_LEVELS = [5, 10, 20, 40] as const
export type BookMaxLevels = (typeof BOOK_MAX_LEVELS)[number]

/** Price bucket width: 0 is the finest grouping for the price, 1 and 2 are ten and a hundred times wider. */
export const BOOK_GROUPS = [0, 1, 2] as const
export type BookGroup = (typeof BOOK_GROUPS)[number]

/** How the order book is drawn: a line per level from when it appeared, or a profile of the book now at the edge. */
export const BOOK_STYLES = ['lines', 'bars'] as const
export type BookStyle = (typeof BOOK_STYLES)[number]

export type IndicatorState = {
  book: {
    style: BookStyle
    /** Keep drawing lines for levels that have gone, faded, where they stopped. */
    ended: boolean
    on: boolean
    sides: BookSides
    range: BookRange
    minShare: BookMinShare
    maxLevels: BookMaxLevels
    group: BookGroup
    labels: boolean
  }
  sessions: { on: boolean } & Record<SessionId, boolean>
  fvg: { on: boolean; minAtr: FvgSize; showFilled: boolean }
  structure: { on: boolean; length: SwingLength; labels: boolean }
  bias: { on: boolean; higher: BiasFrame }
  liquidity: { on: boolean; tolerance: LiquidityTolerance; showTaken: boolean }
  sweeps: { on: boolean; swings: boolean }
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
  book: { on: false, style: 'lines', ended: true, sides: 'both', range: 0.02, minShare: 0.1, maxLevels: 10, group: 1, labels: true },
  sessions: { on: false, asia: true, london: true, newYork: true },
  fvg: { on: false, minAtr: 0.25, showFilled: false },
  structure: { on: false, length: 5, labels: true },
  bias: { on: false, higher: '4H' },
  liquidity: { on: false, tolerance: 0.1, showTaken: false },
  sweeps: { on: false, swings: false },
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
    const liquidity = { ...DEFAULTS.liquidity, ...saved.liquidity }
    if (!LIQUIDITY_TOLERANCES.includes(liquidity.tolerance)) liquidity.tolerance = DEFAULTS.liquidity.tolerance
    const book = { ...DEFAULTS.book, ...saved.book }
    if (!BOOK_STYLES.includes(book.style)) book.style = DEFAULTS.book.style
    if (!BOOK_SIDES.includes(book.sides)) book.sides = DEFAULTS.book.sides
    if (!BOOK_RANGES.includes(book.range)) book.range = DEFAULTS.book.range
    if (!BOOK_MIN_SHARES.includes(book.minShare)) book.minShare = DEFAULTS.book.minShare
    if (!BOOK_MAX_LEVELS.includes(book.maxLevels)) book.maxLevels = DEFAULTS.book.maxLevels
    if (!BOOK_GROUPS.includes(book.group)) book.group = DEFAULTS.book.group
    const orderBlocks = { ...DEFAULTS.orderBlocks, ...saved.orderBlocks }
    if (!OB_STRENGTHS.includes(orderBlocks.strength)) orderBlocks.strength = DEFAULTS.orderBlocks.strength
    const footprint = { ...DEFAULTS.footprint, ...saved.footprint }
    if (!FOOTPRINT_ROWS.includes(footprint.rows)) footprint.rows = DEFAULTS.footprint.rows
    if (!FOOTPRINT_ABSORB.includes(footprint.absorb)) footprint.absorb = DEFAULTS.footprint.absorb
    if (!FOOTPRINT_CELLS.includes(footprint.cells)) footprint.cells = DEFAULTS.footprint.cells
    if (!FOOTPRINT_IMBALANCE.includes(footprint.imbalance)) footprint.imbalance = DEFAULTS.footprint.imbalance
    return {
      book,
      sessions: { ...DEFAULTS.sessions, ...saved.sessions },
      fvg,
      structure,
      bias,
      liquidity,
      sweeps: { ...DEFAULTS.sweeps, ...saved.sweeps },
      orderBlocks,
      footprint,
    }
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

const patch = <K extends keyof IndicatorState>(key: K, p: Partial<IndicatorState[K]>) =>
  set({ ...get(), [key]: { ...get()[key], ...p } })

export const indicators = {
  get,
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  setBook: (p: Partial<IndicatorState['book']>) => patch('book', p),
  setSessions: (p: Partial<IndicatorState['sessions']>) => patch('sessions', p),
  setFvg: (p: Partial<IndicatorState['fvg']>) => patch('fvg', p),
  setStructure: (p: Partial<IndicatorState['structure']>) => patch('structure', p),
  setBias: (p: Partial<IndicatorState['bias']>) => patch('bias', p),
  setLiquidity: (p: Partial<IndicatorState['liquidity']>) => patch('liquidity', p),
  setSweeps: (p: Partial<IndicatorState['sweeps']>) => patch('sweeps', p),
  setOrderBlocks: (p: Partial<IndicatorState['orderBlocks']>) => patch('orderBlocks', p),
  setFootprint: (p: Partial<IndicatorState['footprint']>) => patch('footprint', p),
}

/** How many indicators are on, for the toolbar button. */
export const activeCount = (s: IndicatorState) => Object.values(s).filter((i) => i.on).length

export const useIndicators = () => useSyncExternalStore(indicators.subscribe, indicators.get, () => DEFAULTS)
