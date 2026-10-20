// Market news from publisher RSS feeds, merged newest first. Feeds are fetched from the server (fixed IP, one fetch
// shared by every user) and kept for a few minutes; a feed that fails keeps serving its last good copy and is
// reported as stale rather than dropped. Only what RSS already offers for syndication is passed on: headline,
// link, time and the short summary. Readers go to the publisher for the story.

export type NewsItem = {
  id: string
  title: string
  url: string
  source: string
  publishedAt: number
  summary: string
  /** Coins the headline or summary names, as tickers (BTC, ETH, …). */
  coins: string[]
}

export type NewsSource = { name: string; ok: boolean; count: number; fetchedAt: number | null }

const FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
] as const

const TTL = 5 * 60_000
const KEEP = 120

// Coins we tag: tickers match in capitals as whole words, names in any case. Names that are common words
// (Link, Sui) only count as the ticker.
const COINS: { ticker: string; names: string[] }[] = [
  { ticker: 'BTC', names: ['bitcoin'] },
  { ticker: 'ETH', names: ['ethereum', 'ether'] },
  { ticker: 'SOL', names: ['solana'] },
  { ticker: 'XRP', names: ['ripple'] },
  { ticker: 'DOGE', names: ['dogecoin'] },
  { ticker: 'BNB', names: ['bnb chain'] },
  { ticker: 'ADA', names: ['cardano'] },
  { ticker: 'AVAX', names: ['avalanche'] },
  { ticker: 'LINK', names: ['chainlink'] },
  { ticker: 'SUI', names: [] },
  { ticker: 'LTC', names: ['litecoin'] },
  { ticker: 'DOT', names: ['polkadot'] },
  { ticker: 'TRX', names: ['tron'] },
  { ticker: 'HYPE', names: ['hyperliquid'] },
  { ticker: 'PEPE', names: [] },
  { ticker: 'ZEC', names: ['zcash'] },
  { ticker: 'TON', names: ['toncoin'] },
  { ticker: 'USDT', names: ['tether'] },
  { ticker: 'USDC', names: [] },
]

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ') // summaries carry markup; keep the words
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : ''
}

/** Short enough for two lines of a list, cut at a word. */
function clip(s: string, max = 240) {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`
}

export function coinsIn(text: string) {
  const lower = text.toLowerCase()
  return COINS.filter(
    (c) => new RegExp(`\\b${c.ticker}\\b`).test(text) || c.names.some((n) => new RegExp(`\\b${n}\\b`).test(lower)),
  ).map((c) => c.ticker)
}

export function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = []
  for (const [, block] of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
    const title = tag(block, 'title')
    const url = tag(block, 'link') || tag(block, 'guid')
    const publishedAt = Date.parse(tag(block, 'pubDate'))
    if (!title || !/^https?:\/\//.test(url) || Number.isNaN(publishedAt)) continue
    const summary = clip(tag(block, 'description'))
    items.push({
      id: url,
      title,
      url,
      source,
      publishedAt,
      summary: summary === title ? '' : summary,
      coins: coinsIn(`${title} ${summary}`),
    })
  }
  return items
}

type Cached = { items: NewsItem[]; ok: boolean; fetchedAt: number | null }
const cache = new Map<string, Cached>()
let inflight: Promise<void> | null = null
let refreshedAt = 0

async function fetchFeed(feed: (typeof FEEDS)[number]) {
  const prev = cache.get(feed.name)
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'crypz-news/1.0 (+https://crypz.space)', Accept: 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const items = parseFeed(await res.text(), feed.name)
    if (!items.length) throw new Error('no items')
    cache.set(feed.name, { items, ok: true, fetchedAt: Date.now() })
  } catch (e) {
    console.error(`[news] ${feed.name}: ${e instanceof Error ? e.message : e}`)
    cache.set(feed.name, { items: prev?.items ?? [], ok: false, fetchedAt: prev?.fetchedAt ?? null })
  }
}

/** Every feed, merged newest first; refetched at most every few minutes, by one request at a time. */
export async function marketNews() {
  if (Date.now() - refreshedAt > TTL) {
    inflight ??= Promise.all(FEEDS.map(fetchFeed)).then(() => {
      refreshedAt = Date.now()
      inflight = null
    })
    await inflight
  }
  // the same story syndicated under one URL appears once
  const seen = new Set<string>()
  const items = FEEDS.flatMap((f) => cache.get(f.name)?.items ?? [])
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((i) => !seen.has(i.url) && seen.add(i.url))
    .slice(0, KEEP)
  const sources: NewsSource[] = FEEDS.map((f) => {
    const c = cache.get(f.name)
    return { name: f.name, ok: c?.ok ?? false, count: c?.items.length ?? 0, fetchedAt: c?.fetchedAt ?? null }
  })
  return { items, sources }
}
