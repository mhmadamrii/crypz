import { useSyncExternalStore } from 'react'
import type { Minute } from './footprint'

// One WebSocket to OKX's public feed for the whole app. Public market data needs no key, so the browser talks to
// OKX directly and the api stays out of the hot path. Every channel is reference-counted: the first widget that
// needs `books BTC-USDT-SWAP` subscribes it, the last one to leave unsubscribes it, and all of them share the data.
// Updates reach React at most once per animation frame, however fast OKX pushes.

const URL = 'wss://ws.okx.com:8443/ws/v5/public'

/** A channel on one instrument, or on a whole instrument type (liquidations arrive for every swap at once). */
export type Arg = { channel: string; instId?: string; instType?: string }
type Push = { action?: 'snapshot' | 'update'; data: unknown[] }
type Handler = (push: Push) => void

const keyOf = (a: Arg) => `${a.channel}:${a.instId ?? a.instType}`

class OkxPublic {
  private ws: WebSocket | null = null
  private subs = new Map<string, { arg: Arg; handlers: Set<Handler> }>()
  private retry = 0
  private ping: ReturnType<typeof setInterval> | undefined
  private reconnect: ReturnType<typeof setTimeout> | undefined
  /** Connection state for the workspace's status pill. */
  status: 'idle' | 'connecting' | 'live' | 'retrying' = 'idle'
  private statusListeners = new Set<() => void>()

  subscribe(arg: Arg, handler: Handler) {
    const key = keyOf(arg)
    let sub = this.subs.get(key)
    if (!sub) {
      sub = { arg, handlers: new Set() }
      this.subs.set(key, sub)
      this.send({ op: 'subscribe', args: [arg] })
    }
    sub.handlers.add(handler)
    this.connect()
    return () => {
      const s = this.subs.get(key)
      if (!s) return
      s.handlers.delete(handler)
      if (s.handlers.size) return
      this.subs.delete(key)
      this.send({ op: 'unsubscribe', args: [arg] })
    }
  }

  /** Start a channel over, e.g. after a gap in the order-book sequence. */
  resubscribe(arg: Arg) {
    this.send({ op: 'unsubscribe', args: [arg] })
    this.send({ op: 'subscribe', args: [arg] })
  }

  onStatus(fn: () => void) {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  private setStatus(s: OkxPublic['status']) {
    this.status = s
    for (const fn of this.statusListeners) fn()
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private connect() {
    if (this.ws || typeof window === 'undefined') return
    this.setStatus(this.retry ? 'retrying' : 'connecting')
    const ws = new WebSocket(URL)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.setStatus('live')
      const args = [...this.subs.values()].map((s) => s.arg)
      if (args.length) this.send({ op: 'subscribe', args })
      // OKX drops idle connections after 30s; a text "ping" keeps it open
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 20_000)
    }
    ws.onmessage = (e) => {
      if (e.data === 'pong') return
      const msg = JSON.parse(e.data as string) as { event?: string; arg?: Arg } & Push
      if (msg.event || !msg.arg || !msg.data) return
      const sub = this.subs.get(keyOf(msg.arg))
      if (sub) for (const h of sub.handlers) h(msg)
    }
    ws.onclose = () => {
      clearInterval(this.ping)
      this.ws = null
      if (!this.subs.size) return this.setStatus('idle')
      this.setStatus('retrying')
      const delay = Math.min(15_000, 1000 * 2 ** this.retry++)
      clearTimeout(this.reconnect)
      this.reconnect = setTimeout(() => this.connect(), delay)
    }
  }
}

export const okxPublic = new OkxPublic()

export const useFeedStatus = () =>
  useSyncExternalStore(
    (fn) => okxPublic.onStatus(fn),
    () => okxPublic.status,
    () => 'idle' as const,
  )

/**
 * A reference-counted, frame-batched store for one channel. `reduce` folds each push into the value; returning the
 * same object means "nothing changed".
 */
class Feed<T> {
  private value: T
  private listeners = new Set<() => void>()
  private stop: (() => void) | undefined
  private frame = 0

  constructor(
    private arg: Arg,
    private initial: T,
    private reduce: (prev: T, push: Push, feed: { resync: () => void }) => T,
  ) {
    this.value = initial
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      const resync = () => okxPublic.resubscribe(this.arg)
      this.stop = okxPublic.subscribe(this.arg, (push) => {
        const next = this.reduce(this.value, push, { resync })
        if (next === this.value) return
        this.value = next
        if (!this.frame) this.frame = requestAnimationFrame(this.flush)
      })
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size) return
      this.stop?.()
      cancelAnimationFrame(this.frame)
      this.frame = 0
      this.value = this.initial
    }
  }

  get = () => this.value

  private flush = () => {
    this.frame = 0
    for (const l of this.listeners) l()
  }
}

const feeds = new Map<string, Feed<unknown>>()

/** `name` lets a second store fold the same channel differently (the footprint reads the trades channel too). */
function feed<T>(
  arg: Arg,
  initial: T,
  reduce: (prev: T, push: Push, f: { resync: () => void }) => T,
  name = keyOf(arg),
) {
  const key = name
  if (!feeds.has(key)) feeds.set(key, new Feed(arg, initial, reduce) as Feed<unknown>)
  return feeds.get(key) as Feed<T>
}

function useFeed<T>(f: Feed<T>, server: T) {
  return useSyncExternalStore(f.subscribe, f.get, () => server)
}

// ---- channels ------------------------------------------------------------------------------------------------

export type Ticker = {
  last: string
  open24h: string
  high24h: string
  low24h: string
  volCcy24h: string
  vol24h: string
  bidPx: string
  askPx: string
  ts: string
}

export function useTicker(instId: string) {
  return useFeed(
    feed<Ticker | null>({ channel: 'tickers', instId }, null, (_, p) => (p.data[0] as Ticker) ?? null),
    null,
  )
}

export type Trade = { tradeId: string; px: string; sz: string; side: 'buy' | 'sell'; ts: string }
const TAPE = 150

export function useTrades(instId: string) {
  return useFeed(
    feed<Trade[]>({ channel: 'trades', instId }, [], (prev, p) => {
      const fresh = (p.data as Trade[]).slice().reverse()
      return [...fresh, ...prev].slice(0, TAPE)
    }),
    [],
  )
}

// Footprint: every trade since the widget opened, as buy and sell size per raw price per minute, with each minute's
// open, high, low and close. Grouping into price rows and longer columns happens at render (`lib/footprint.ts`), so
// changing them needs no re-fold. The last hour is kept.

export type Footprint = {
  /** First trade seen (ms); 0 until then. */
  since: number
  /** Price and time of the newest trade. */
  last: number
  lastTs: number
  minutes: Map<number, Minute>
}

const FOOTPRINT_EMPTY: Footprint = { since: 0, last: 0, lastTs: 0, minutes: new Map() }
const FOOTPRINT_KEEP = 60 * 60_000

function foldFootprint(prev: Footprint, p: Push): Footprint {
  const trades = p.data as Trade[]
  if (!trades.length) return prev
  // the empty store is shared and reused after a reset, so the first push starts a fresh map instead
  const minutes = prev.since ? prev.minutes : new Map<number, Minute>()
  let first = Infinity
  let latest = { ts: prev.lastTs, px: prev.last }
  for (const t of trades) {
    const ts = Number(t.ts)
    const px = Number(t.px)
    const minute = ts - (ts % 60_000)
    first = Math.min(first, ts)
    if (ts >= latest.ts) latest = { ts, px }
    let m = minutes.get(minute)
    if (!m) {
      m = { levels: new Map(), open: px, high: px, low: px, close: px, first: ts, last: ts }
      minutes.set(minute, m)
    }
    if (ts < m.first) [m.open, m.first] = [px, ts]
    if (ts >= m.last) [m.close, m.last] = [px, ts]
    m.high = Math.max(m.high, px)
    m.low = Math.min(m.low, px)
    const cell = m.levels.get(t.px) ?? [0, 0]
    cell[t.side === 'buy' ? 0 : 1] += Number(t.sz)
    m.levels.set(t.px, cell)
  }
  for (const m of minutes.keys()) if (m < latest.ts - FOOTPRINT_KEEP) minutes.delete(m)
  return { since: prev.since || first, last: latest.px, lastTs: latest.ts, minutes }
}

export function useFootprint(instId: string) {
  return useFeed(
    feed<Footprint>({ channel: 'trades', instId }, FOOTPRINT_EMPTY, foldFootprint, `footprint:${instId}`),
    FOOTPRINT_EMPTY,
  )
}

// Liquidations: OKX pushes forced closes for every swap on one channel. The store keeps the latest few hundred across
// all instruments and each widget picks its own; `side` is the position that was closed.

export type LiveLiquidation = { instId: string; time: number; side: 'long' | 'short'; price: number; size: number }
type LiquidationPush = { instId: string; details: { side: string; bkPx: string; sz: string; ts: string }[] }

const LIQ_KEEP = 400
const LIQ_EMPTY: LiveLiquidation[] = []

export function useLiquidationFeed() {
  return useFeed(
    feed<LiveLiquidation[]>({ channel: 'liquidation-orders', instType: 'SWAP' }, LIQ_EMPTY, (prev, p) => {
      const fresh = (p.data as LiquidationPush[]).flatMap((o) =>
        o.details.map((d): LiveLiquidation => ({
          instId: o.instId,
          time: Number(d.ts),
          side: d.side === 'sell' ? 'long' : 'short',
          price: Number(d.bkPx),
          size: Number(d.sz),
        })),
      )
      return fresh.length ? [...fresh.sort((a, b) => b.time - a.time), ...prev].slice(0, LIQ_KEEP) : prev
    }),
    LIQ_EMPTY,
  )
}

/** The spot index a perpetual tracks, e.g. BTC-USDT for BTC-USDT-SWAP. */
export function useIndexPrice(instId: string) {
  return useFeed(
    feed<string | null>(
      { channel: 'index-tickers', instId: instId.replace(/-SWAP$/, '') },
      null,
      (_, p) => (p.data[0] as { idxPx: string } | undefined)?.idxPx ?? null,
    ),
    null,
  )
}

export type Funding = { fundingRate: string; nextFundingRate?: string; fundingTime: string; nextFundingTime?: string }

export function useFunding(instId: string) {
  return useFeed(
    feed<Funding | null>({ channel: 'funding-rate', instId }, null, (_, p) => (p.data[0] as Funding) ?? null),
    null,
  )
}

export function useMarkPrice(instId: string) {
  return useFeed(
    feed<string | null>(
      { channel: 'mark-price', instId },
      null,
      (_, p) => (p.data[0] as { markPx: string } | undefined)?.markPx ?? null,
    ),
    null,
  )
}

// Order book: 400 levels per side, a snapshot then incremental updates. OKX no longer fills the CRC checksum
// (it arrives as 0); integrity comes from the sequence instead: each update's prevSeqId must equal the seqId of the
// message before it. Any gap means a missed update, so the book starts over from a fresh snapshot.

type Level = [px: string, sz: string, liq: string, orders: string]
type BookPush = { asks: Level[]; bids: Level[]; ts: string; seqId: number; prevSeqId: number }
export type Book = { bids: Map<string, string>; asks: Map<string, string>; ts: number; seq: number }

const EMPTY: Book = { bids: new Map(), asks: new Map(), ts: 0, seq: -1 }

function applyBook(prev: Book, p: Push, f: { resync: () => void }): Book {
  const d = p.data[0] as BookPush | undefined
  if (!d) return prev
  const snapshot = p.action === 'snapshot'
  if (!snapshot && (prev.seq < 0 || d.prevSeqId !== prev.seq)) {
    f.resync()
    return EMPTY
  }
  if (!snapshot && !d.bids.length && !d.asks.length) return { ...prev, seq: d.seqId } // heartbeat: nothing moved
  const bids = snapshot ? new Map<string, string>() : new Map(prev.bids)
  const asks = snapshot ? new Map<string, string>() : new Map(prev.asks)
  for (const [px, sz] of d.bids) sz === '0' ? bids.delete(px) : bids.set(px, sz)
  for (const [px, sz] of d.asks) sz === '0' ? asks.delete(px) : asks.set(px, sz)
  return { bids, asks, ts: Number(d.ts), seq: d.seqId }
}

export function useBook(instId: string) {
  return useFeed(feed<Book>({ channel: 'books', instId }, EMPTY, applyBook), EMPTY)
}
