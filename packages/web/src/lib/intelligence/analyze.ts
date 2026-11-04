import type { Candle, LongShort, OpenInterest, Premium, TakerFlow } from '@crypz/exchanges'
import { bookState, type BookState, type Instrument } from '@/lib/book'
import { liquidityOf } from '@/lib/indicators/liquidity'
import { computeBias } from '@/lib/indicators/bias'
import { profileOf } from '@/lib/profile'
import {
  flowEngine,
  forcedEngine,
  liquidityEngine,
  positioningEngine,
  structureEngine,
  type Feeds,
  type Signals,
} from './engines'
import { freshnessOf, SOURCES, usable, type SourceId } from './freshness'
import { HORIZON_CONFIG, horizonMs } from './horizons'
import { keyLevels } from './levels'
import { marketState, MIN_BARS } from './market-state'
import { priorOf } from './outcome'
import { scoreScenarios } from './scenarios'
import type { Engine, Horizon, KeyLevel, MarketIntelligence, MarketState, SourceStatus } from './types'

// The deterministic analysis: a snapshot of the feeds in, a MarketIntelligence out. Pure and synchronous, so every
// claim on the page traces to an input here and a rule in this folder. Nothing in it calls a model or a network.

/** Data a feed delivered, when this browser last received it, and which instrument and interval it is for. */
export type Sourced<T> = { data: T | null; at: number | null; tag: string }

export type AnalysisInput = {
  symbol: string
  horizon: Horizon
  now: number
  candles: Sourced<Candle[]>
  /** Live last price. */
  price: Sourced<number>
  book: {
    bids: Map<string, string>
    asks: Map<string, string>
    spec: Instrument | null
    state: BookState
    /** When the book last heard from OKX. */
    at: number
    tag: string
  } | null
  taker: Sourced<TakerFlow[]>
  openInterest: Sourced<OpenInterest[]>
  longShort: Sourced<LongShort[]>
  premium: Sourced<Premium[]>
  funding: Sourced<number>
  liquidations: Sourced<{ time: number; side: 'long' | 'short'; usd: number }[]>
  tape: Sourced<{ side: 'buy' | 'sell'; size: number }[]>
}

/** What each feed must be tagged with. A feed tagged for another instrument or interval is treated as missing. */
export const tagFor = {
  candles: (symbol: string, h: Horizon) => `${symbol}:${HORIZON_CONFIG[h].bar}`,
  stat: (symbol: string, h: Horizon) => `${symbol}:${HORIZON_CONFIG[h].stat}`,
  live: (symbol: string) => symbol,
}

const MODEL = { mode: 'qualitative', version: 'qual-1', calibrated: false } as const

export function analyze(input: AnalysisInput): MarketIntelligence {
  const { symbol, horizon, now } = input
  const cfg = HORIZON_CONFIG[horizon]
  const own = <T>(s: Sourced<T>, tag: string): Sourced<T> => (s.tag === tag ? s : { data: null, at: null, tag })

  // -- feeds: wrong-instrument or wrong-interval data never gets in
  const candles = own(input.candles, tagFor.candles(symbol, horizon))
  const price = own(input.price, tagFor.live(symbol))
  const taker = own(input.taker, tagFor.stat(symbol, horizon))
  const oi = own(input.openInterest, tagFor.stat(symbol, horizon))
  const ls = own(input.longShort, tagFor.stat(symbol, horizon))
  const premium = own(input.premium, tagFor.live(symbol))
  const funding = own(input.funding, tagFor.live(symbol))
  const liqs = own(input.liquidations, tagFor.live(symbol))
  const tape = own(input.tape, tagFor.live(symbol))
  const book = input.book && input.book.tag === tagFor.live(symbol) && input.book.spec ? input.book : null

  const f = (id: SourceId, at: number | null, has: boolean) => ({
    freshness: has ? freshnessOf(at, now, id) : ('unavailable' as const),
    at: has ? at : null,
  })
  const feeds: Feeds = {
    candles: f('candles', candles.at, !!candles.data?.length),
    ticker: f('ticker', price.at, price.data !== null),
    book: {
      freshness: book
        ? book.state === 'live'
          ? 'fresh'
          : book.state === 'loading'
            ? 'unavailable'
            : 'stale'
        : 'unavailable',
      at: book ? book.at : null,
    },
    taker: f('taker', taker.at, !!taker.data?.length),
    openInterest: f('openInterest', oi.at, !!oi.data?.length),
    longShort: f('longShort', ls.at, !!ls.data?.length),
    premium: f('premium', premium.at, !!premium.data?.length),
    funding: f('funding', funding.at, funding.data !== null),
    liquidations: f('liquidations', liqs.at, liqs.data !== null),
  }

  const sources: SourceStatus[] = (Object.keys(SOURCES) as SourceId[]).map((id) => ({
    id,
    label: SOURCES[id].label,
    freshness: feeds[id].freshness,
    at: feeds[id].at,
  }))
  const staleSources = sources.filter((s) => s.freshness === 'stale').map((s) => s.label)
  const missingSources = sources.filter((s) => s.freshness === 'unavailable').map((s) => s.label)

  // -- the chart: without enough fresh candles there is nothing to analyse
  const bars = candles.data ?? []
  const base = {
    instrument: symbol,
    venue: 'OKX' as const,
    marketType: symbol.endsWith('-SWAP') ? ('perpetual' as const) : ('spot' as const),
    horizon,
    bar: cfg.bar,
    windowBars: cfg.window,
    asOf: now,
    model: MODEL,
  }
  const withPrice = (price: number | null) => ({ ...base, price })
  const emptyState: MarketState = {
    structure: 'unclear',
    trend: 'unclear',
    momentum: { state: 'unclear', direction: null },
    volatility: { state: 'unclear', ratio: null },
    liquidity: 'unclear',
    derivatives: 'unavailable',
  }
  if (!usable(feeds.candles.freshness) || bars.length < MIN_BARS)
    return {
      ...withPrice(null),
      dataQuality: { status: 'insufficient', staleSources, missingSources, sources },
      marketState: emptyState,
      engines: [],
      evidence: [],
      scenarios: [],
      keyLevels: [],
    }

  // -- the market state and its reference levels
  const ms = marketState(bars, cfg)
  const last = bars[bars.length - 1].close
  const px = price.data !== null && usable(feeds.ticker.freshness) ? price.data : last
  const bias = computeBias({ chart: bars, chartLabel: cfg.bar, higher: null, higherLabel: null, length: cfg.swing })
  const ema = bias.factors.find((x) => x.id === 'ema')?.side ?? null
  const profile = profileOf(bars)
  const area =
    profile.total > 0
      ? { val: profile.lo + profile.bottom * profile.size, vah: profile.lo + (profile.top + 1) * profile.size }
      : null
  const trendText =
    ms.state.trend === 'higher_highs_higher_lows'
      ? 'higher highs, higher lows'
      : ms.state.trend === 'lower_highs_lower_lows'
        ? 'lower highs, lower lows'
        : ''

  // -- the five engines
  const structure = structureEngine({
    feeds,
    structure: ms.state.structure,
    trendText,
    bar: cfg.bar,
    ema,
    price: px,
    area,
  })
  const liquidity = liquidityEngine({
    feeds,
    book: book && book.spec ? { bids: book.bids, asks: book.asks, spec: book.spec } : null,
    price: px,
  })
  const flow = flowEngine({ feeds, taker: taker.data, tape: tape.data, candles: bars, atr: ms.atr })
  const positioning = positioningEngine({
    feeds,
    oi: oi.data,
    longShort: ls.data,
    premium: premium.data,
    funding: funding.data,
    candles: bars,
    atr: ms.atr,
  })
  const forced = forcedEngine({
    feeds,
    events: liqs.data,
    now,
    lookbackMs: Math.max(3 * horizonMs(horizon), 15 * 60_000),
  })
  const engines: Engine[] = [structure, liquidity.engine, flow.engine, positioning.engine, forced]
  const signals: Signals = {
    flowDivergence: flow.divergence,
    crowding: positioning.crowding,
    askWall: liquidity.walls.askWall,
    bidWall: liquidity.walls.bidWall,
  }

  // -- levels and scenarios
  const pools = liquidityOf(bars, { tolerance: 0.1, swing: cfg.swing }).levels
  const levels: KeyLevel[] = keyLevels({
    price: px,
    structure: ms.structure,
    bar: cfg.bar,
    profile,
    pools,
    walls: liquidity.walls,
    feeds,
  })
  const scenarios = ms.refs
    ? scoreScenarios({
        prior: priorOf(ms.state.structure, ms.choch),
        structure: ms.state.structure,
        volatility: ms.state.volatility.state,
        choch: ms.choch,
        atr: ms.atr,
        price: px,
        refs: ms.refs,
        engines,
        signals,
        bar: cfg.bar,
        windowBars: cfg.window,
      })
    : []

  // the leading scenario's invalidation is a level of its own
  const lead = scenarios.find((s) => s.qualitativeRank === 'favored') ?? scenarios.find((s) => s.applicable)
  if (lead && ms.refs) {
    const breaksUp = lead.id === 'bullish_continuation' || lead.id === 'bullish_reversal'
    const breaksDown = lead.id === 'bearish_continuation' || lead.id === 'bearish_reversal'
    if (breaksUp || breaksDown)
      levels.push({
        id: 'invalidation',
        type: 'invalidation',
        price: breaksUp ? ms.refs.low : ms.refs.high,
        source: `Invalidation of ${lead.id.replace('_', ' ')}`,
        observedAt: feeds.candles.at,
      })
  }

  const evidence = engines.flatMap((e) => e.items)
  const missingEngines = engines.filter((e) => e.state === 'unavailable').length
  const degraded = staleSources.length + missingSources.length > 0 || missingEngines > 0
  return {
    ...withPrice(px),
    dataQuality: { status: degraded ? 'degraded' : 'good', staleSources, missingSources, sources },
    marketState: {
      ...ms.state,
      liquidity: liquidity.condition,
      derivatives: positioning.derivatives,
    },
    engines,
    evidence,
    scenarios,
    keyLevels: levels,
  }
}
