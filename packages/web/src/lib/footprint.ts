// Footprint reading: taker buy and sell size per price row per column of time, and what can be read off it.
// Everything works on minutes of trades (live from the trades feed today; from stored trade history in replay later),
// grouped into columns and price rows here, so changing either needs no re-fold.
//
// Imbalance is diagonal by default, as the aggressors meet the book: a buyer lifts the ask one row above where a
// seller hits the bid, so buying at a row is weighed against selling one row below it (or against the same row, as an
// option). Three or more imbalanced rows in a row on the same side are stacked.
//
// Absorption is aggression that went nowhere: heavy selling into the low of a column (or buying into its high), within
// its outer third, while the column closes back outside that third and the next column does not trade past the
// extreme. Someone resting there took everything. It needs the next column to be finished, so a mark appears one
// column late and never moves.

export type Minute = {
  levels: Map<string, [buy: number, sell: number]>
  open: number
  high: number
  low: number
  close: number
  /** First and last trade time in the minute (ms), which decide open and close when pushes arrive out of order. */
  first: number
  last: number
}

export type Column = {
  start: number
  /** Price row (price / step, floored) → [buy, sell]. */
  cells: Map<number, [buy: number, sell: number]>
  buy: number
  sell: number
  /** The row that traded the most. */
  poc: number
  open: number
  high: number
  low: number
  close: number
  /** A trade has arrived after the column's end, so it can no longer change. */
  closed: boolean
}

export const rowOf = (price: number, step: number) => Math.floor(price / step + 1e-9)

/** Columns of `span` ms from the minutes, oldest first. `now` is the newest trade time. */
export function columnsOf(minutes: Map<number, Minute>, span: number, step: number, now: number): Column[] {
  const columns = new Map<number, Column & { first: number; last: number }>()
  for (const [minute, m] of minutes) {
    const start = minute - (minute % span)
    let col = columns.get(start)
    if (!col) {
      const { open, high, low, close, first, last } = m
      const closed = start + span <= now
      col = { start, cells: new Map(), buy: 0, sell: 0, poc: 0, open, high, low, close, first, last, closed }
      columns.set(start, col)
    }
    if (m.first < col.first) [col.open, col.first] = [m.open, m.first]
    if (m.last > col.last) [col.close, col.last] = [m.close, m.last]
    col.high = Math.max(col.high, m.high)
    col.low = Math.min(col.low, m.low)
    for (const [px, [buy, sell]] of m.levels) {
      const k = rowOf(Number(px), step)
      const cell = col.cells.get(k) ?? [0, 0]
      cell[0] += buy
      cell[1] += sell
      col.cells.set(k, cell)
    }
  }
  const list = [...columns.values()].sort((a, b) => a.start - b.start)
  for (const col of list) {
    let pocSize = -1
    for (const [k, [b, s]] of col.cells) {
      col.buy += b
      col.sell += s
      if (b + s > pocSize) [col.poc, pocSize] = [k, b + s]
    }
  }
  return list
}

export type Imbalance = { side: 'buy' | 'sell'; stacked: boolean }

/** Which size a row's side is weighed against: its diagonal neighbour, the other side of the same row, or none. */
export type ImbalanceMode = 'diagonal' | 'row' | 'off'

/**
 * Imbalances in a column by row. Diagonal: buying at a row `ratio` times the selling one row below, or selling at a
 * row `ratio` times the buying one row above (the two sides of the spread, who actually faced each other). Row:
 * buying `ratio` times the selling at the same price, or the mirror. A side under a tenth of the column's busiest
 * row is noise in either.
 */
export function imbalancesOf(col: Column, mode: ImbalanceMode = 'diagonal', ratio = 3) {
  const out = new Map<number, Imbalance>()
  if (mode === 'off') return out
  let peak = 0
  for (const [b, s] of col.cells.values()) peak = Math.max(peak, b + s)
  const floor = peak * 0.1
  for (const [k, [buy, sell]] of col.cells) {
    // diagonal: a row the column never traded is no evidence either way, so the outer rows only count inward
    const below = col.cells.get(k - 1)
    const above = col.cells.get(k + 1)
    const buys = buy >= floor && (mode === 'row' ? buy >= sell * ratio : !!below && buy >= below[1] * ratio)
    const sells = sell >= floor && (mode === 'row' ? sell >= buy * ratio : !!above && sell >= above[0] * ratio)
    // both at once only happens on thin rows; the larger side wins
    if (buys && (!sells || buy >= sell)) out.set(k, { side: 'buy', stacked: false })
    else if (sells) out.set(k, { side: 'sell', stacked: false })
  }
  for (const [k, imb] of out) {
    let run = 1
    for (let j = k - 1; out.get(j)?.side === imb.side; j--) run++
    for (let j = k + 1; out.get(j)?.side === imb.side; j++) run++
    imb.stacked = run >= 3
  }
  return out
}

export type Absorption = {
  /** The passive side that held: bids under the low, asks over the high. */
  side: 'bid' | 'ask'
  /** The row that took the most aggression. */
  row: number
  /** Aggressive size into the extreme (the two adjacent rows that took the most). */
  size: number
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** How much of a column's range, from each end, counts as its extreme: a third, and never fewer than two rows. */
const EXTREME = 1 / 3

/**
 * Absorption per column start. The aggression must sit in the outer third of the column's range (at least two
 * rows): the two adjacent rows there that took the most of one side, which must be `factor` times the column's
 * median row and outweigh the other side there 1.5:1. The column has to close outside that third, and the next
 * column, finished, must not trade beyond the extreme. In a column of a few rows the third is the two outer rows.
 */
export function absorptionsOf(cols: Column[], step: number, factor = 3) {
  const out = new Map<number, Absorption>()
  for (let i = 0; i < cols.length - 1; i++) {
    const col = cols[i]
    const next = cols[i + 1]
    if (!col.closed || !next.closed || col.cells.size < 3) continue
    const keys = [...col.cells.keys()].sort((a, b) => a - b)
    const heavy = factor * median(keys.map((k) => col.cells.get(k)![0] + col.cells.get(k)![1]))
    const closeRow = rowOf(col.close, step)
    const low = keys[0]
    const high = keys.at(-1)!
    const zone = Math.max(2, Math.ceil((high - low + 1) * EXTREME))

    /** The pair of adjacent rows in `from..to` that took the most of `into`, among those it outweighs 1.5:1. */
    const best = (from: number, to: number, into: 0 | 1) => {
      let found: { row: number; size: number } | null = null
      for (let k = from; k < to; k++) {
        const a = col.cells.get(k) ?? [0, 0]
        const b = col.cells.get(k + 1) ?? [0, 0]
        const size = a[into] + b[into]
        if (size < (a[1 - into] + b[1 - into]) * 1.5 || (found && size <= found.size)) continue
        found = { row: a[into] >= b[into] ? k : k + 1, size }
      }
      return found && found.size >= heavy ? found : null
    }

    // sellers (index 1) into the low, held by bids; buyers (index 0) into the high, held by asks
    const bid = closeRow > low + zone - 1 && next.low >= col.low ? best(low, low + zone - 1, 1) : null
    const ask = closeRow < high - zone + 1 && next.high <= col.high ? best(high - zone + 1, high, 0) : null
    const pickAsk = ask && (!bid || ask.size > bid.size)
    if (pickAsk) out.set(col.start, { side: 'ask', ...ask })
    else if (bid) out.set(col.start, { side: 'bid', ...bid })
  }
  return out
}

// ---- history (replay) ---------------------------------------------------------------------------------------
// The api folds OKX's daily trade files into minute bars, one OKX day (UTC+8) per request.

/** [time, open, high, low, close, [row, buy, sell, …]] at the day's `step`. */
export type HistoryBar = [number, number, number, number, number, number[]]

export const FIRST_HISTORY_DAY = '2021-11-01'
const UTC8 = 8 * 3_600_000

/** The OKX day (UTC+8 calendar date) a moment falls in. */
export const okxDay = (ms: number) => new Date(ms + UTC8).toISOString().slice(0, 10)

/** Every OKX day from the one holding `from` to the one holding `to`, oldest first. */
export function okxDays(from: number, to: number) {
  const days: string[] = []
  for (let d = okxDay(from); d <= okxDay(to); d = okxDay(Date.parse(`${d}T00:00:00Z`) - UTC8 + 36 * 3_600_000))
    days.push(d)
  return days
}

/**
 * Stored bars as minutes. Each row stands at its middle price, so grouping into any coarser row (a multiple of
 * `step`) never lands a row on the wrong side of a boundary through float error.
 */
export function minutesOf(bars: HistoryBar[], step: number, into = new Map<number, Minute>()) {
  for (const [time, open, high, low, close, flat] of bars) {
    const levels = new Map<string, [number, number]>()
    for (let i = 0; i < flat.length; i += 3) levels.set(String((flat[i] + 0.5) * step), [flat[i + 1], flat[i + 2]])
    into.set(time, { levels, open, high, low, close, first: time, last: time + 59_999 })
  }
  return into
}

/**
 * The columns as they stood at `now`, from `all` (every column, built with `now = Infinity`): those finished by
 * then, plus the one `now` sits inside, rebuilt from the minutes that had closed. Nothing after `now` is read.
 */
export function columnsAt(all: Column[], minutes: Map<number, Minute>, span: number, step: number, now: number) {
  const done = all.filter((c) => c.start + span <= now)
  const start = now - (now % span)
  if (start === now) return done
  const inside = new Map<number, Minute>()
  for (let t = start; t + 60_000 <= now; t += 60_000) {
    const m = minutes.get(t)
    if (m) inside.set(t, m)
  }
  return inside.size ? [...done, ...columnsOf(inside, span, step, now)] : done
}
