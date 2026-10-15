import type { Position } from './types'

export type Bucket = {
  key: string
  label: string
  count: number
  wins: number
  winRate: number
  realized: number
  fees: number
}

export type CurvePoint = { t: number; v: number; symbol: string; side: Position['side']; delta: number }

export type Stats = {
  count: number
  wins: number
  losses: number
  winRate: number
  realized: number
  gross: number
  fees: number
  funding: number
  avgWin: number
  avgLoss: number
  payoff: number
  profitFactor: number
  expectancy: number
  best: Position | null
  worst: Position | null
  maxWinStreak: number
  maxLossStreak: number
  currentStreak: { kind: 'win' | 'loss' | null; length: number }
  avgHoldMs: number
  avgHoldWinMs: number
  avgHoldLossMs: number
  /** Cumulative realized PnL after each close, with the trade that moved it. */
  curve: CurvePoint[]
  maxDrawdown: number
  byInstrument: Bucket[]
  bySide: Bucket[]
  byHour: Bucket[]
  byWeekday: Bucket[]
  byLeverage: Bucket[]
  byHold: Bucket[]
}

const isWin = (p: Position) => p.realizedPnl > 0
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0)

const HOLD_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: '15m', label: '< 15m', max: 15 * 60e3 },
  { key: '1h', label: '15m – 1h', max: 60 * 60e3 },
  { key: '4h', label: '1h – 4h', max: 4 * 60 * 60e3 },
  { key: '1d', label: '4h – 1d', max: 24 * 60 * 60e3 },
  { key: 'gt1d', label: '> 1d', max: Infinity },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function group(
  positions: Position[],
  keyOf: (p: Position) => string,
  labelOf: (key: string) => string = (k) => k,
  keys?: string[],
): Bucket[] {
  const map = new Map<string, Position[]>()
  for (const k of keys ?? []) map.set(k, [])
  for (const p of positions) {
    const k = keyOf(p)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(p)
  }
  return [...map.entries()].map(([key, ps]) => {
    const wins = ps.filter(isWin).length
    return {
      key,
      label: labelOf(key),
      count: ps.length,
      wins,
      winRate: ps.length ? wins / ps.length : 0,
      realized: sum(ps.map((p) => p.realizedPnl)),
      fees: sum(ps.map((p) => p.fee)),
    }
  })
}

export function computeStats(input: Position[]): Stats {
  const positions = [...input].sort((a, b) => a.closedAt - b.closedAt)
  const winners = positions.filter(isWin)
  const losers = positions.filter((p) => !isWin(p))
  const winSum = sum(winners.map((p) => p.realizedPnl))
  const lossSum = sum(losers.map((p) => p.realizedPnl))
  const realized = winSum + lossSum

  let maxWinStreak = 0
  let maxLossStreak = 0
  let run = 0
  let runKind: 'win' | 'loss' | null = null
  for (const p of positions) {
    const kind = isWin(p) ? 'win' : 'loss'
    run = kind === runKind ? run + 1 : 1
    runKind = kind
    if (kind === 'win') maxWinStreak = Math.max(maxWinStreak, run)
    else maxLossStreak = Math.max(maxLossStreak, run)
  }

  let cum = 0
  let peak = 0
  let maxDrawdown = 0
  const curve = positions.map((p) => {
    cum += p.realizedPnl
    peak = Math.max(peak, cum)
    maxDrawdown = Math.max(maxDrawdown, peak - cum)
    return { t: p.closedAt, v: cum, symbol: p.symbol, side: p.side, delta: p.realizedPnl }
  })

  const hold = (p: Position) => p.closedAt - p.openedAt
  const avgWin = mean(winners.map((p) => p.realizedPnl))
  const avgLoss = mean(losers.map((p) => p.realizedPnl))

  return {
    count: positions.length,
    wins: winners.length,
    losses: losers.length,
    winRate: positions.length ? winners.length / positions.length : 0,
    realized,
    gross: sum(positions.map((p) => p.pnl)),
    fees: sum(positions.map((p) => p.fee)),
    funding: sum(positions.map((p) => p.funding)),
    avgWin,
    avgLoss,
    payoff: avgLoss ? avgWin / Math.abs(avgLoss) : 0,
    profitFactor: lossSum ? winSum / Math.abs(lossSum) : winSum > 0 ? Infinity : 0,
    expectancy: positions.length ? realized / positions.length : 0,
    best: positions.reduce<Position | null>((b, p) => (!b || p.realizedPnl > b.realizedPnl ? p : b), null),
    worst: positions.reduce<Position | null>((w, p) => (!w || p.realizedPnl < w.realizedPnl ? p : w), null),
    maxWinStreak,
    maxLossStreak,
    currentStreak: { kind: runKind, length: run },
    avgHoldMs: mean(positions.map(hold)),
    avgHoldWinMs: mean(winners.map(hold)),
    avgHoldLossMs: mean(losers.map(hold)),
    curve,
    maxDrawdown,
    byInstrument: group(positions, (p) => p.base).sort((a, b) => b.realized - a.realized),
    bySide: group(
      positions,
      (p) => p.side,
      (k) => (k === 'long' ? 'Long' : 'Short'),
      ['long', 'short'],
    ),
    byHour: group(
      positions,
      (p) => String(new Date(p.openedAt).getHours()),
      (k) => `${k.padStart(2, '0')}:00`,
      Array.from({ length: 24 }, (_, i) => String(i)),
    ),
    byWeekday: group(
      positions,
      (p) => String(new Date(p.openedAt).getDay()),
      (k) => WEEKDAYS[Number(k)],
      ['1', '2', '3', '4', '5', '6', '0'],
    ),
    byLeverage: group(positions, (p) => `${p.leverage}x`).sort((a, b) => parseFloat(a.key) - parseFloat(b.key)),
    byHold: group(
      positions,
      (p) => HOLD_BUCKETS.find((b) => hold(p) < b.max)!.key,
      (k) => HOLD_BUCKETS.find((b) => b.key === k)!.label,
      HOLD_BUCKETS.map((b) => b.key),
    ),
  }
}

export type Insight = { tone: 'leak' | 'edge' | 'note'; text: string }

/** Rule-based readouts. Placeholder for the planned Gemini insight layer. */
/** `singleAsset`: the stats cover one asset, so cross-asset leak/edge rules say nothing. */
export function deriveInsights(s: Stats, { singleAsset = false } = {}): Insight[] {
  if (!s.count) return []
  const out: Insight[] = []
  const meaningful = (b: Bucket) => b.count >= 5

  const worst = singleAsset
    ? undefined
    : [...s.byInstrument].filter(meaningful).sort((a, b) => a.realized - b.realized)[0]
  if (worst && worst.realized < 0)
    out.push({
      tone: 'leak',
      text: `${worst.label} is your biggest leak: ${fmt(worst.realized)} USDT over ${worst.count} trades at ${pct(worst.winRate)} win rate.`,
    })

  const best = singleAsset ? undefined : s.byInstrument.filter(meaningful)[0]
  if (best && best.realized > 0)
    out.push({
      tone: 'edge',
      text: `${best.label} carries your edge: ${fmt(best.realized)} USDT across ${best.count} trades.`,
    })

  const [long, short] = s.bySide
  if (long.count && short.count) {
    const better = long.realized > short.realized ? long : short
    const worse = better === long ? short : long
    out.push({
      tone: 'note',
      text: `${better.label}s net ${fmt(better.realized)} vs ${worse.label.toLowerCase()}s ${fmt(worse.realized)}. Win rate ${pct(better.winRate)} vs ${pct(worse.winRate)}.`,
    })
  }

  if (s.gross !== 0 && Math.abs(s.fees) > 0)
    out.push({
      tone: Math.abs(s.fees) > Math.abs(s.gross) ? 'leak' : 'note',
      text: `Fees took ${fmt(s.fees)} USDT, ${Math.round((Math.abs(s.fees) / Math.max(Math.abs(s.gross), 1e-9)) * 100)}% of gross PnL.`,
    })

  if (s.avgHoldLossMs > s.avgHoldWinMs * 1.3)
    out.push({
      tone: 'leak',
      text: `You hold losers ${(s.avgHoldLossMs / Math.max(s.avgHoldWinMs, 1)).toFixed(1)}× longer than winners.`,
    })

  const hours = s.byHour.filter(meaningful).sort((a, b) => a.realized - b.realized)
  if (hours[0] && hours[0].realized < 0)
    out.push({
      tone: 'leak',
      text: `Trades opened around ${hours[0].label} lose the most: ${fmt(hours[0].realized)} over ${hours[0].count}.`,
    })

  return out
}

const fmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`
