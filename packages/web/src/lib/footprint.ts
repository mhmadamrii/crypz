// Footprint reading: taker buy and sell size per price row per column of time, and what can be read off it.
// Everything works on minutes of trades (live from the trades feed today; from stored trade history in replay later),
// grouped into columns and price rows here, so changing either needs no re-fold.
//
// Imbalance is diagonal, as the aggressors meet the book: a buyer lifts the ask one row above where a seller hits the
// bid, so buying at a row is weighed against selling one row below it. Three or more imbalanced rows in a row on the
// same side are stacked.
//
// Absorption is aggression that went nowhere: heavy selling into a column's low (or buying into its high) while the
// column closes away from that extreme and the next column does not trade past it. Someone resting at that level
// took everything. It needs the next column to be finished, so a mark appears one column late and never moves.

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

/**
 * Diagonal imbalances in a column by row: buying at a row `ratio` times the selling one row below, or selling at a
 * row `ratio` times the buying one row above. A side under a tenth of the column's busiest row is noise.
 */
export function imbalancesOf(col: Column, ratio = 3) {
  let peak = 0
  for (const [b, s] of col.cells.values()) peak = Math.max(peak, b + s)
  const floor = peak * 0.1
  const out = new Map<number, Imbalance>()
  for (const [k, [buy, sell]] of col.cells) {
    // a row the column never traded is no evidence either way, so the column's outer rows only count inward
    const below = col.cells.get(k - 1)
    const above = col.cells.get(k + 1)
    const buys = !!below && buy >= floor && buy >= below[1] * ratio
    const sells = !!above && sell >= floor && sell >= above[0] * ratio
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
  /** Aggressive size into the extreme (its two outer rows). */
  size: number
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Absorption per column start. `factor` is how heavy the aggression at the extreme must be, in multiples of the
 * column's median row; the side doing it must also outweigh the other there 1.5:1. The column has to close at least
 * two rows off that extreme, and the next column, finished, must not trade beyond it.
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

    const edge = (rows: number[], into: 0 | 1) => {
      let size = 0
      let against = 0
      let row = rows[0]
      for (const k of rows) {
        const cell = col.cells.get(k)
        if (!cell) continue
        size += cell[into]
        against += cell[1 - into]
        if (cell[into] > (col.cells.get(row)?.[into] ?? 0)) row = k
      }
      return size >= heavy && size >= against * 1.5 ? { row, size } : null
    }

    const low = keys[0]
    const high = keys.at(-1)!
    // sellers (index 1) into the low, held by bids; buyers (index 0) into the high, held by asks
    const bid = closeRow >= low + 2 && next.low >= col.low ? edge([low, low + 1], 1) : null
    const ask = closeRow <= high - 2 && next.high <= col.high ? edge([high, high - 1], 0) : null
    const pickAsk = ask && (!bid || ask.size > bid.size)
    if (pickAsk) out.set(col.start, { side: 'ask', ...ask })
    else if (bid) out.set(col.start, { side: 'bid', ...bid })
  }
  return out
}
