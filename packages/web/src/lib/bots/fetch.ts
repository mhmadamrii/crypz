import { BAR_MS, type Bar, type Candle } from '@crypz/exchanges'

/**
 * Closed candles from `from` up to `to` (ms), oldest first, by paging backwards from `to` with `getPage(before)`
 * (each page oldest first, older than `before`). The forming candle and anything past `to` are dropped.
 * `maxPages` stops a runaway loop; exceeding it throws rather than returning a silently short series.
 */
export async function fetchRange(
  getPage: (before: number) => Promise<Candle[]>,
  bar: Bar,
  from: number,
  to: number,
  { maxPages = 400, now = Date.now(), onPage }: { maxPages?: number; now?: number; onPage?: (n: number) => void } = {},
): Promise<Candle[]> {
  const ms = BAR_MS[bar]
  const pages: Candle[][] = []
  let cursor = Math.min(to, now) + ms
  for (let n = 0; ; n++) {
    if (n >= maxPages) throw new Error(`Range needs more than ${maxPages} requests. Shorten the dates.`)
    const page = await getPage(cursor)
    if (!page.length) break
    pages.push(page)
    onPage?.(n + 1)
    const oldest = page[0].time
    if (oldest <= from || oldest >= cursor) break
    cursor = oldest
  }
  return pages
    .flat()
    .filter((k) => k.time >= from && k.time + ms <= Math.min(to, now))
    .sort((a, b) => a.time - b.time)
}
