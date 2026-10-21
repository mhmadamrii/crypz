import { createInflateRaw } from 'node:zlib'
import { db } from '@crypz/db'

// Footprint history for replay: taker buy and sell size per price row per minute, folded from OKX's daily trade
// files and cached in Postgres one day at a time. Nothing is downloaded until someone asks for a day; past trades
// never change, so a built day is kept for good.
//
// OKX publishes one zip per instrument per day at a CDN path its data-download page links to (undocumented, so it
// may move). A day there is a UTC+8 day, 16:00 to 16:00 UTC, and appears around 23:30 UTC the same date. Each row
// is one trade with the taker's side and the size in contracts, the unit the live trades feed uses too. Files
// before 2021-11 list every trade twice, once per side, so they cannot tell buyers from sellers and are refused.

export const FIRST_DAY = '2021-11-01'
const UTC8 = 8 * 3_600_000

/** The OKX day (UTC+8 calendar date) a moment falls in. */
export const okxDay = (ms: number) => new Date(ms + UTC8).toISOString().slice(0, 10)

/** When OKX's file for `day` should be up: the day ends at 16:00 UTC and the file follows by about 7.5 hours. */
export const publishedBy = (day: string) => Date.parse(`${day}T23:59:00Z`)

const fileUrl = (symbol: string, day: string) =>
  `https://static.okx.com/cdn/okex/traderecords/trades/daily/${day.replaceAll('-', '')}/${symbol}-trades-${day}.zip`

/** Row size the day is folded at: four digits under the price's magnitude (1 for BTC near 80,000). */
const baseStep = (price: number) => 10 ** (Math.floor(Math.log10(price)) - 4)

type MinuteAcc = {
  open: number
  high: number
  low: number
  close: number
  first: number
  last: number
  levels: Map<number, [buy: number, sell: number]>
}

/** [time, open, high, low, close, [row, buy, sell, …]] */
export type FootprintBar = [number, number, number, number, number, number[]]

class NotFound extends Error {}

/** The single file in a zip: its compressed bytes and method, read through the central directory. */
function zipEntry(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('The trade file is not a zip.')
  const central = view.getUint32(eocd + 16, true)
  if (view.getUint32(central, true) !== 0x02014b50) throw new Error('The trade file zip is damaged.')
  const method = view.getUint16(central + 10, true)
  const size = view.getUint32(central + 20, true)
  const local = view.getUint32(central + 42, true)
  // the local header's name and extra lengths can differ from the central copy's
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
  if (method !== 8 && method !== 0) throw new Error(`The trade file uses zip method ${method}.`)
  return { method, data: buf.subarray(start, start + size) }
}

/** Every line of the zipped CSV, inflated as a stream so the 80 MB of text never sits in memory at once. */
async function* lines(entry: { method: number; data: Uint8Array }) {
  const decoder = new TextDecoder()
  let rest = ''
  const chunks: AsyncIterable<Uint8Array> | Uint8Array[] =
    entry.method === 0
      ? [entry.data]
      : (() => {
          const inflate = createInflateRaw()
          inflate.end(entry.data)
          return inflate
        })()
  for await (const chunk of chunks) {
    rest += decoder.decode(chunk, { stream: true })
    const parts = rest.split('\n')
    rest = parts.pop()!
    yield* parts
  }
  if (rest) yield rest
}

/** Download one day and fold it into minute bars. */
export async function buildDay(symbol: string, day: string) {
  const res = await fetch(fileUrl(symbol, day))
  if (res.status === 404) throw new NotFound(`OKX has no trade file for ${symbol} on ${day}.`)
  if (!res.ok) throw new Error(`OKX trade file request failed (${res.status}).`)
  const entry = zipEntry(new Uint8Array(await res.arrayBuffer()))

  const minutes = new Map<number, MinuteAcc>()
  let cols: { side: number; price: number; size: number; time: number } | null = null
  let step = 0
  let trades = 0
  for await (const line of lines(entry)) {
    // older files end lines with CRLF
    const f = line.trimEnd().split(',')
    if (f.length < 2) continue
    if (!cols) {
      // columns by name: OKX has added columns before (`source`, in 2026)
      const at = (name: string) => {
        const i = f.indexOf(name)
        if (i < 0) throw new Error(`The trade file has no ${name} column.`)
        return i
      }
      cols = { side: at('side'), price: at('price'), size: at('size'), time: at('created_time') }
      continue
    }
    const px = Number(f[cols.price])
    const sz = Number(f[cols.size])
    const ts = Number(f[cols.time])
    if (!(px > 0) || !(sz > 0) || !ts) continue
    // older files write the side in capitals
    const side = f[cols.side].toLowerCase() === 'buy' ? 0 : 1
    if (!step) step = baseStep(px)
    const minute = ts - (ts % 60_000)
    let m = minutes.get(minute)
    if (!m) {
      m = { open: px, high: px, low: px, close: px, first: ts, last: ts, levels: new Map() }
      minutes.set(minute, m)
    }
    if (ts < m.first) [m.open, m.first] = [px, ts]
    if (ts >= m.last) [m.close, m.last] = [px, ts]
    if (px > m.high) m.high = px
    if (px < m.low) m.low = px
    const row = Math.floor(px / step + 1e-9)
    const cell = m.levels.get(row) ?? [0, 0]
    cell[side] += sz
    m.levels.set(row, cell)
    trades++
  }
  if (!trades) throw new Error(`The trade file for ${symbol} on ${day} is empty.`)

  // sizes are summed floats; round off the binary dust so the stored JSON stays short
  const round = (n: number) => Math.round(n * 1e8) / 1e8
  const bars: FootprintBar[] = [...minutes]
    .sort((a, b) => a[0] - b[0])
    .map(([time, m]) => [
      time,
      m.open,
      m.high,
      m.low,
      m.close,
      [...m.levels].sort((a, b) => a[0] - b[0]).flatMap(([row, [b, s]]) => [row, round(b), round(s)]),
    ])
  return { step, trades, bars }
}

// ---- the build queue ----------------------------------------------------------------------------------------
// One build at a time: a day is a 5–15 MB download and a few seconds of parsing, and the api shares its box with
// the database. The queue lives in this process; a row left pending by a restart is picked up again the next time
// someone asks for it.

const EXCHANGE = 'okx'
const queue: { symbol: string; day: string }[] = []
const queued = new Set<string>()
let running = false

const keyOf = (symbol: string, day: string) => `${symbol}|${day}`

function enqueue(symbol: string, day: string) {
  const key = keyOf(symbol, day)
  if (queued.has(key)) return
  queued.add(key)
  queue.push({ symbol, day })
  void pump()
}

async function pump() {
  if (running) return
  running = true
  while (queue.length) {
    const { symbol, day } = queue.shift()!
    const where = { exchange_symbol_day: { exchange: EXCHANGE, symbol, day } }
    try {
      const built = await buildDay(symbol, day)
      await db().footprintDay.update({ where, data: { status: 'ready', error: null, ...built } })
    } catch (err) {
      const message = err instanceof NotFound ? err.message : `Could not build this day: ${(err as Error).message}`
      console.error(`[footprint] ${symbol} ${day}:`, (err as Error).message)
      await db()
        .footprintDay.update({ where, data: { status: 'failed', error: message } })
        .catch(() => {})
    } finally {
      queued.delete(keyOf(symbol, day))
    }
  }
  running = false
}

export type FootprintDayResult =
  | { status: 'ready'; day: string; step: number; bars: FootprintBar[] }
  | { status: 'pending'; day: string }
  | { status: 'unpublished'; day: string; at: number }
  | { status: 'failed'; day: string; error: string }

/**
 * A day's footprint if it is built; otherwise starts building it and says so. `retry` rebuilds a failed day.
 * A day OKX has not published yet is never stored, so it is tried again once the file is due.
 */
export async function footprintDay(symbol: string, day: string, retry = false): Promise<FootprintDayResult> {
  const at = publishedBy(day)
  if (Date.now() < at) return { status: 'unpublished', day, at }
  const where = { exchange_symbol_day: { exchange: EXCHANGE, symbol, day } }
  const row = await db().footprintDay.findUnique({ where })
  if (row?.status === 'ready') return { status: 'ready', day, step: row.step!, bars: row.bars as FootprintBar[] }
  if (row?.status === 'failed' && !retry) return { status: 'failed', day, error: row.error ?? 'Could not build.' }
  if (!row) {
    // two requests for the same new day race here; the loser's insert is skipped and it just waits on the winner
    await db().footprintDay.createMany({
      data: [{ exchange: EXCHANGE, symbol, day, status: 'pending' }],
      skipDuplicates: true,
    })
  } else if (row.status === 'failed') {
    await db().footprintDay.update({ where, data: { status: 'pending', error: null } })
  }
  enqueue(symbol, day)
  return { status: 'pending', day }
}
