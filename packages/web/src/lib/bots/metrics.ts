import type { BotTrade, EquityPoint } from './types'

// Every figure is in USDT after fees and slippage, on closed trades only.
//  - win rate: trades with net PnL above 0, over all closed trades
//  - profit factor: net profit of the winning trades over the absolute net loss of the losing ones
//    (null: there was no loss to divide by; Infinity when there was profit)
//  - R: net PnL over the risk budget (equity at entry times the risk %)
//  - drawdown: peak to later trough of the closed-trade equity curve; it does not see losses inside an open trade

export type Metrics = {
  initialEquity: number
  finalEquity: number
  netPnl: number
  netPct: number
  trades: number
  wins: number
  winRate: number | null
  profitFactor: number | null
  avgWin: number | null
  avgLoss: number | null
  expectancy: number | null
  expectancyR: number | null
  avgR: number | null
  maxDrawdown: number
  maxDrawdownPct: number
  totalFees: number
  totalSlippage: number
  /** Share of the window spent in a position. */
  exposure: number | null
}

export function drawdownCurve(equity: EquityPoint[]) {
  let peak = -Infinity
  return equity.map((p) => {
    peak = Math.max(peak, p.equity)
    return { time: p.time, drawdown: peak - p.equity, pct: peak > 0 ? ((peak - p.equity) / peak) * 100 : 0 }
  })
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

export function computeMetrics(
  trades: BotTrade[],
  equity: EquityPoint[],
  initialEquity: number,
  window: { from: number; to: number },
): Metrics {
  const finalEquity = equity.length ? equity[equity.length - 1].equity : initialEquity
  const wins = trades.filter((t) => t.netPnl > 0)
  const losses = trades.filter((t) => t.netPnl < 0)
  const profit = wins.reduce((s, t) => s + t.netPnl, 0)
  const loss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0))
  const dd = drawdownCurve(equity)
  const held = trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0)
  const span = window.to - window.from
  return {
    initialEquity,
    finalEquity,
    netPnl: finalEquity - initialEquity,
    netPct: ((finalEquity - initialEquity) / initialEquity) * 100,
    trades: trades.length,
    wins: wins.length,
    winRate: trades.length ? wins.length / trades.length : null,
    profitFactor: loss > 0 ? profit / loss : profit > 0 ? Infinity : null,
    avgWin: mean(wins.map((t) => t.netPnl)),
    avgLoss: mean(losses.map((t) => t.netPnl)),
    expectancy: mean(trades.map((t) => t.netPnl)),
    expectancyR: mean(trades.map((t) => t.r)),
    avgR: mean(trades.map((t) => t.r)),
    maxDrawdown: Math.max(0, ...dd.map((p) => p.drawdown)),
    maxDrawdownPct: Math.max(0, ...dd.map((p) => p.pct)),
    totalFees: trades.reduce((s, t) => s + t.fees, 0),
    totalSlippage: trades.reduce((s, t) => s + t.slippageCost, 0),
    exposure: span > 0 && trades.length ? held / span : null,
  }
}

const HEAD = [
  'id',
  'side',
  'entry_time',
  'entry',
  'stop',
  'target',
  'exit_time',
  'exit',
  'reason',
  'contracts',
  'risk_amount',
  'gross_pnl',
  'fees',
  'net_pnl',
  'r',
  'equity_after',
] as const

/** The trade list as CSV, times in UTC ISO. */
export function tradesCsv(trades: BotTrade[]) {
  const iso = (ms: number) => new Date(ms).toISOString()
  const rows = trades.map((t) =>
    [
      t.id,
      t.side,
      iso(t.entryTime),
      t.entry,
      t.stop,
      t.target,
      iso(t.exitTime),
      t.exit,
      t.reason,
      t.contracts,
      t.riskBudget.toFixed(4),
      t.grossPnl.toFixed(4),
      t.fees.toFixed(4),
      t.netPnl.toFixed(4),
      t.r.toFixed(3),
      t.equityAfter.toFixed(4),
    ].join(','),
  )
  return [HEAD.join(','), ...rows].join('\n')
}
