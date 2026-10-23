// Risk of a trading plan from its numbers alone: how often you win, what a win pays, what each trade risks. Every
// trade risks `riskPct` of the equity at that moment and wins `rr` times that, so results compound.

export type RiskInput = {
  /** Win rate, in percent. */
  winRate: number
  /** Reward multiple R in 1:R. */
  rr: number
  /** Percent of equity risked on each trade. */
  riskPct: number
  /** Trades in the run being judged. */
  trades: number
  /** The drawdown, in percent from the equity peak, whose odds are reported. */
  drawdownLimit: number
}

export type StreakRow = {
  /** Consecutive losses. */
  length: number
  /** Chance of at least one such streak somewhere in the run. */
  odds: number
  /** What that streak takes off the equity, in percent. */
  drawdown: number
}

export type Simulation = {
  runs: number
  /** Share of runs that end above the starting equity. */
  profitable: number
  /** Final equity as a multiple of the start: the 5th percentile, median and 95th. */
  final: { low: number; median: number; high: number }
  /** Worst peak-to-trough fall in a run, in percent: the median, and the 95th percentile (1 run in 20 is worse). */
  drawdown: { median: number; bad: number }
  /** Share of runs that fall at least `drawdownLimit` from a peak at some point. */
  hitLimit: number
}

export type RiskResult = {
  /** Average result of one trade, in R. */
  expectancy: number
  /** The win rate at which expectancy is zero, in percent. */
  breakeven: number
  /** Expected log growth per trade, as a percent of equity: what compounding really earns. */
  growth: number
  streaks: StreakRow[]
  simulation: Simulation
}

export type FieldErrors = Partial<Record<keyof RiskInput, string>>

export const DEFAULT_INPUT: RiskInput = { winRate: 40, rr: 3, riskPct: 1, trades: 100, drawdownLimit: 20 }

export const MAX_TRADES = 1000

export function validate(i: RiskInput): FieldErrors {
  const e: FieldErrors = {}
  if (!(i.winRate > 0 && i.winRate < 100)) e.winRate = 'Enter a win rate between 0 and 100%.'
  if (!(i.rr > 0)) e.rr = 'Reward multiple must be above 0.'
  if (!(i.riskPct > 0)) e.riskPct = 'Risk must be above 0%.'
  else if (i.riskPct >= 100) e.riskPct = 'Risk must stay under 100% of equity.'
  if (!Number.isInteger(i.trades) || i.trades < 1) e.trades = 'Enter a whole number of trades.'
  else if (i.trades > MAX_TRADES) e.trades = `Up to ${MAX_TRADES} trades.`
  if (!(i.drawdownLimit > 0 && i.drawdownLimit < 100)) e.drawdownLimit = 'Enter a drawdown between 0 and 100%.'
  return e
}

/** Streak lengths worth a row. */
const STREAKS = [3, 4, 5, 6, 8, 10]

/** Chance of at least one run of `k` losses in `n` trades, each lost with probability `q`: exact, by dynamic programming. */
export function streakOdds(n: number, k: number, q: number) {
  // state[j] = chance of being j losses into a run, with no k-run yet
  let state = new Array<number>(k).fill(0)
  state[0] = 1
  let hit = 0
  for (let t = 0; t < n; t++) {
    const next = new Array<number>(k).fill(0)
    for (let j = 0; j < k; j++) {
      const p = state[j]
      if (!p) continue
      next[0] += p * (1 - q)
      if (j + 1 === k) hit += p * q
      else next[j + 1] += p * q
    }
    state = next
  }
  return hit
}

/** A small seeded generator, so the same inputs always show the same simulation. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RUNS = 4000

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]

function simulate(i: RiskInput): Simulation {
  const rand = mulberry32(20261022)
  const p = i.winRate / 100
  const win = 1 + (i.riskPct / 100) * i.rr
  const loss = 1 - i.riskPct / 100
  const finals: number[] = []
  const drawdowns: number[] = []
  let profitable = 0
  let hit = 0
  for (let r = 0; r < RUNS; r++) {
    let equity = 1
    let peak = 1
    let worst = 0
    for (let t = 0; t < i.trades; t++) {
      equity *= rand() < p ? win : loss
      if (equity > peak) peak = equity
      else worst = Math.max(worst, 1 - equity / peak)
    }
    finals.push(equity)
    drawdowns.push(worst * 100)
    if (equity > 1) profitable++
    if (worst * 100 >= i.drawdownLimit) hit++
  }
  finals.sort((a, b) => a - b)
  drawdowns.sort((a, b) => a - b)
  return {
    runs: RUNS,
    profitable: profitable / RUNS,
    final: { low: pct(finals, 0.05), median: pct(finals, 0.5), high: pct(finals, 0.95) },
    drawdown: { median: pct(drawdowns, 0.5), bad: pct(drawdowns, 0.95) },
    hitLimit: hit / RUNS,
  }
}

export function calculate(i: RiskInput): RiskResult | null {
  if (Object.keys(validate(i)).length) return null
  const p = i.winRate / 100
  const r = i.riskPct / 100
  return {
    expectancy: p * i.rr - (1 - p),
    breakeven: 100 / (1 + i.rr),
    growth: (p * Math.log(1 + r * i.rr) + (1 - p) * Math.log(1 - r)) * 100,
    streaks: STREAKS.map((length) => ({
      length,
      odds: streakOdds(i.trades, length, 1 - p),
      drawdown: (1 - (1 - r) ** length) * 100,
    })),
    simulation: simulate(i),
  }
}

/** The gain needed to get back to the peak after falling `drawdown` percent. */
export const recovery = (drawdown: number) => (drawdown >= 100 ? Infinity : (drawdown / (100 - drawdown)) * 100)
