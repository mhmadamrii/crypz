import type { Position } from '@crypz/exchanges'

export type SortKey = 'newest' | 'oldest' | 'best' | 'worst' | 'longest'

export type PositionFilter = {
  assets: string[]
  side: 'all' | 'long' | 'short'
  result: 'all' | 'win' | 'loss'
  leverage: number[]
  /** yyyy-mm-dd, local time, inclusive. Empty = open-ended. */
  from: string
  to: string
  /** Realized PnL bounds in USDT. Empty = open-ended. */
  minPnl: string
  maxPnl: string
  sort: SortKey
}

export const EMPTY_FILTER: PositionFilter = {
  assets: [],
  side: 'all',
  result: 'all',
  leverage: [],
  from: '',
  to: '',
  minPnl: '',
  maxPnl: '',
  sort: 'newest',
}

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  best: 'Best result first',
  worst: 'Worst result first',
  longest: 'Longest hold first',
}

const dayStart = (d: string) => new Date(`${d}T00:00:00`).getTime()
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999`).getTime()
const parse = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))

export function applyFilter(positions: Position[], f: PositionFilter): Position[] {
  const min = parse(f.minPnl)
  const max = parse(f.maxPnl)
  const from = f.from ? dayStart(f.from) : null
  const to = f.to ? dayEnd(f.to) : null

  const out = positions.filter(
    (p) =>
      (!f.assets.length || f.assets.includes(p.base)) &&
      (f.side === 'all' || p.side === f.side) &&
      (f.result === 'all' || (f.result === 'win' ? p.realizedPnl > 0 : p.realizedPnl <= 0)) &&
      (!f.leverage.length || f.leverage.includes(p.leverage)) &&
      (from === null || p.closedAt >= from) &&
      (to === null || p.closedAt <= to) &&
      (min === null || p.realizedPnl >= min) &&
      (max === null || p.realizedPnl <= max),
  )

  const by: Record<SortKey, (a: Position, b: Position) => number> = {
    newest: (a, b) => b.closedAt - a.closedAt,
    oldest: (a, b) => a.closedAt - b.closedAt,
    best: (a, b) => b.realizedPnl - a.realizedPnl,
    worst: (a, b) => a.realizedPnl - b.realizedPnl,
    longest: (a, b) => b.closedAt - b.openedAt - (a.closedAt - a.openedAt),
  }
  return out.sort(by[f.sort])
}

/** One removable chip per active constraint (sort is not a constraint). */
export function activeChips(f: PositionFilter): { key: string; label: string; clear: Partial<PositionFilter> }[] {
  const chips: { key: string; label: string; clear: Partial<PositionFilter> }[] = []
  for (const a of f.assets) chips.push({ key: `a:${a}`, label: a, clear: { assets: f.assets.filter((x) => x !== a) } })
  if (f.side !== 'all')
    chips.push({ key: 'side', label: f.side === 'long' ? 'Longs' : 'Shorts', clear: { side: 'all' } })
  if (f.result !== 'all')
    chips.push({ key: 'result', label: f.result === 'win' ? 'Winners' : 'Losers', clear: { result: 'all' } })
  for (const l of f.leverage)
    chips.push({ key: `l:${l}`, label: `${l}x`, clear: { leverage: f.leverage.filter((x) => x !== l) } })
  if (f.from || f.to)
    chips.push({ key: 'date', label: `${f.from || '…'} → ${f.to || '…'}`, clear: { from: '', to: '' } })
  if (f.minPnl || f.maxPnl)
    chips.push({
      key: 'pnl',
      label: `PnL ${f.minPnl || '−∞'} … ${f.maxPnl || '+∞'}`,
      clear: { minPnl: '', maxPnl: '' },
    })
  return chips
}
