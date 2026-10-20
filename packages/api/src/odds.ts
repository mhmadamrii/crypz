import { coinsIn } from './news'

// Prediction-market odds on crypto prices, from Polymarket's public Gamma API (no key). Each event is a ladder of
// yes/no questions ("Bitcoin above $76,000 on October 21?"); the rungs priced between near-certain and near-impossible
// are the ones that say where the crowd puts the price, so only those are passed on. Events that name none of the
// coins we tag are dropped: perps traders want BTC and ETH odds, not token-launch bets. Fetched by the server, kept
// for a few minutes, and served stale (flagged) when Polymarket does not answer.

export type OddsMarket = {
  /** The rung, as Polymarket labels it: "↑ 105,000", "76,000". */
  label: string
  question: string
  /** Last price of "Yes", 0–1: the market's probability. */
  yes: number
}

export type OddsEvent = {
  id: string
  title: string
  url: string
  endsAt: number
  volume24h: number
  coins: string[]
  markets: OddsMarket[]
}

const URL =
  'https://gamma-api.polymarket.com/events?tag_slug=crypto&closed=false&active=true&limit=40&order=volume24hr&ascending=false'
const TTL = 5 * 60_000
const KEEP = 8
/** Rungs outside this band are settled in all but name. */
const CONTESTED = [0.03, 0.97] as const
const RUNGS = 4

type GammaMarket = {
  question?: string
  groupItemTitle?: string
  outcomes?: string
  outcomePrices?: string
  closed?: boolean
  active?: boolean
}
type GammaEvent = {
  id: string
  title: string
  slug: string
  endDate?: string
  volume24hr?: number
  markets?: GammaMarket[]
}

const parseList = (s: string | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/** Sort rungs by the number in their label, so a ladder reads in price order. */
const level = (label: string) => Number(label.replace(/[^\d.]/g, '')) || 0

export function parseEvents(events: GammaEvent[]): OddsEvent[] {
  const out: OddsEvent[] = []
  for (const e of events) {
    const coins = coinsIn(e.title)
    const endsAt = Date.parse(e.endDate ?? '')
    if (!coins.length || Number.isNaN(endsAt) || endsAt < Date.now()) continue
    const markets: OddsMarket[] = []
    for (const m of e.markets ?? []) {
      if (m.closed || m.active === false || !m.question) continue
      const outcomes = parseList(m.outcomes)
      const prices = parseList(m.outcomePrices).map(Number)
      const yes = prices[outcomes.indexOf('Yes')]
      if (yes === undefined || Number.isNaN(yes) || yes < CONTESTED[0] || yes > CONTESTED[1]) continue
      markets.push({ label: m.groupItemTitle || m.question, question: m.question, yes })
    }
    if (!markets.length) continue
    // the rungs nearest a coin flip carry the most information; show those, in price order
    const shown = markets
      .sort((a, b) => Math.abs(a.yes - 0.5) - Math.abs(b.yes - 0.5))
      .slice(0, RUNGS)
      .sort((a, b) => level(a.label) - level(b.label))
    out.push({
      id: e.id,
      title: e.title,
      url: `https://polymarket.com/event/${encodeURIComponent(e.slug)}`,
      endsAt,
      volume24h: e.volume24hr ?? 0,
      coins,
      markets: shown,
    })
    if (out.length === KEEP) break
  }
  return out
}

let cached: { events: OddsEvent[]; ok: boolean; fetchedAt: number | null } = { events: [], ok: false, fetchedAt: null }
let refreshedAt = 0
let inflight: Promise<void> | null = null

async function refresh() {
  try {
    const res = await fetch(URL, {
      headers: { 'User-Agent': 'crypz-news/1.0 (+https://crypz.space)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) throw new Error('unexpected response')
    cached = { events: parseEvents(body as GammaEvent[]), ok: true, fetchedAt: Date.now() }
  } catch (e) {
    console.error(`[odds] polymarket: ${e instanceof Error ? e.message : e}`)
    // keep the last good copy, but drop events that have since ended
    cached = { ...cached, ok: false, events: cached.events.filter((e) => e.endsAt > Date.now()) }
  }
}

/** Crypto price odds, refetched at most every few minutes by one request at a time. */
export async function cryptoOdds() {
  if (Date.now() - refreshedAt > TTL) {
    inflight ??= refresh().then(() => {
      refreshedAt = Date.now()
      inflight = null
    })
    await inflight
  }
  return { source: 'Polymarket', ...cached }
}
