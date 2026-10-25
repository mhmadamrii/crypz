import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A scripted stand-in for the browser's WebSocket, so nothing here touches OKX.
class FakeWS {
  static OPEN = 1
  static instances: FakeWS[] = []
  readyState = 0
  sent: { op: string; args: { channel: string; instId: string }[] }[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(m: string) {
    if (m !== 'ping') this.sent.push(JSON.parse(m))
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  push(msg: object | string) {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) })
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
  ops(op: string) {
    return this.sent.filter((m) => m.op === op)
  }
}

const BTC = { channel: 'books', instId: 'BTC-USDT-SWAP' }
const ETH = { channel: 'books', instId: 'ETH-USDT-SWAP' }
const level = (px: string, sz: string) => [px, sz, '0', '1']
const frame = (
  arg: object,
  action: 'snapshot' | 'update',
  seqId: number,
  prevSeqId: number,
  bids: string[][] = [],
  asks: string[][] = [],
) => ({ arg, action, data: [{ bids, asks, ts: '1700000000000', seqId, prevSeqId }] })

async function load() {
  vi.resetModules()
  return import('./okx-ws')
}
const flush = () => vi.advanceTimersByTime(20) // the feed batches to one animation frame

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  FakeWS.instances = []
  vi.stubGlobal('WebSocket', FakeWS)
  vi.stubGlobal('window', {})
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('applyBook', () => {
  const resync = vi.fn()
  const empty = async () => (await load()).applyBook
  const snap = (applyBook: Awaited<ReturnType<typeof empty>>) =>
    applyBook(
      { bids: new Map(), asks: new Map(), ts: 0, seq: -1, at: 0 },
      frame(BTC, 'snapshot', 10, -1, [level('100', '5'), level('99', '7')], [level('101', '3')]),
      { resync },
    )

  beforeEach(() => resync.mockClear())

  it('parses a snapshot into both sides and stamps when it arrived', async () => {
    const book = snap(await empty())
    expect([...book.bids]).toEqual([
      ['100', '5'],
      ['99', '7'],
    ])
    expect([...book.asks]).toEqual([['101', '3']])
    expect(book.seq).toBe(10)
    expect(book.at).toBe(1_000_000)
  })

  it('applies an update that continues the sequence: new levels, changed sizes', async () => {
    const applyBook = await empty()
    const next = applyBook(snap(applyBook), frame(BTC, 'update', 11, 10, [level('100', '9'), level('98', '1')]), {
      resync,
    })
    expect(next.bids.get('100')).toBe('9')
    expect(next.bids.get('98')).toBe('1')
    expect(next.seq).toBe(11)
    expect(resync).not.toHaveBeenCalled()
  })

  it('removes a price level whose size is zero', async () => {
    const applyBook = await empty()
    const next = applyBook(snap(applyBook), frame(BTC, 'update', 11, 10, [level('99', '0')], [level('101', '0')]), {
      resync,
    })
    expect(next.bids.has('99')).toBe(false)
    expect(next.asks.size).toBe(0)
  })

  it('starts over from a fresh snapshot when the sequence skips', async () => {
    const applyBook = await empty()
    const next = applyBook(snap(applyBook), frame(BTC, 'update', 13, 12, [level('100', '1')]), { resync })
    expect(resync).toHaveBeenCalledOnce()
    expect(next.seq).toBe(-1)
    expect(next.bids.size).toBe(0)
  })

  it('starts over when an update arrives before any snapshot', async () => {
    const applyBook = await empty()
    const next = applyBook(
      { bids: new Map(), asks: new Map(), ts: 0, seq: -1, at: 0 },
      frame(BTC, 'update', 5, 4, [level('1', '1')]),
      { resync },
    )
    expect(resync).toHaveBeenCalledOnce()
    expect(next.seq).toBe(-1)
  })

  it('treats an empty update as a heartbeat: levels untouched, freshness renewed', async () => {
    const applyBook = await empty()
    const first = snap(applyBook)
    vi.setSystemTime(1_060_000)
    const next = applyBook(first, frame(BTC, 'update', 11, 10), { resync })
    expect(next.bids).toBe(first.bids)
    expect(next.seq).toBe(11)
    expect(next.at).toBe(1_060_000)
  })

  it('distrusts a push it cannot read', async () => {
    const applyBook = await empty()
    const bad = { arg: BTC, action: 'update', data: [{ bids: 'nope', asks: [], seqId: 11, prevSeqId: 10 }] }
    const next = applyBook(snap(applyBook), bad as never, { resync })
    expect(resync).toHaveBeenCalledOnce()
    expect(next.seq).toBe(-1)
  })
})

describe('the shared book feed', () => {
  it('hands every consumer of an instrument the same store, and one OKX subscription', async () => {
    const m = await load()
    const a = m.bookFeed(BTC.instId)
    const b = m.bookFeed(BTC.instId)
    expect(a).toBe(b)
    const stopA = a.subscribe(() => {})
    const stopB = b.subscribe(() => {})
    expect(FakeWS.instances).toHaveLength(1)
    FakeWS.instances[0].open()
    const subs = FakeWS.instances[0].ops('subscribe')
    expect(subs).toHaveLength(1)
    expect(subs[0].args).toEqual([BTC])

    stopA()
    expect(FakeWS.instances[0].ops('unsubscribe')).toHaveLength(0) // another consumer still needs it
    stopB()
    expect(FakeWS.instances[0].ops('unsubscribe')).toEqual([{ op: 'unsubscribe', args: [BTC] }])
  })

  it('delivers snapshots then updates to the store, one render batch at a time', async () => {
    const m = await load()
    const store = m.bookFeed(BTC.instId)
    const seen = vi.fn()
    store.subscribe(seen)
    const ws = FakeWS.instances[0]
    ws.open()
    ws.push(frame(BTC, 'snapshot', 1, -1, [level('100', '5')], [level('101', '3')]))
    ws.push(frame(BTC, 'update', 2, 1, [level('100', '8')]))
    ws.push(frame(BTC, 'update', 3, 2, [level('100', '0')]))
    expect(seen).not.toHaveBeenCalled()
    flush()
    expect(seen).toHaveBeenCalledOnce()
    expect(store.get().bids.size).toBe(0)
    expect(store.get().asks.get('101')).toBe('3')
    expect(store.get().seq).toBe(3)
  })

  it('re-subscribes after a gap in the sequence', async () => {
    const m = await load()
    const store = m.bookFeed(BTC.instId)
    store.subscribe(() => {})
    const ws = FakeWS.instances[0]
    ws.open()
    ws.push(frame(BTC, 'snapshot', 1, -1, [level('100', '5')], [level('101', '3')]))
    ws.push(frame(BTC, 'update', 9, 8, [level('100', '1')]))
    flush()
    expect(ws.ops('unsubscribe')).toEqual([{ op: 'unsubscribe', args: [BTC] }])
    expect(ws.ops('subscribe')).toHaveLength(2) // the first, then the recovery
    expect(store.get().seq).toBe(-1)
    ws.push(frame(BTC, 'snapshot', 20, -1, [level('100', '2')], [level('101', '2')]))
    flush()
    expect(store.get().seq).toBe(20)
  })

  it('reconnects with backoff, re-subscribes, and marks the new connection', async () => {
    const m = await load()
    const store = m.bookFeed(BTC.instId)
    store.subscribe(() => {})
    FakeWS.instances[0].open()
    expect(m.okxConnection.get()).toEqual({ status: 'live', since: 1_000_000 })

    FakeWS.instances[0].drop()
    expect(m.okxConnection.get().status).toBe('retrying')
    vi.advanceTimersByTime(1000)
    expect(FakeWS.instances).toHaveLength(2)

    FakeWS.instances[1].open()
    expect(FakeWS.instances[1].ops('subscribe')[0].args).toEqual([BTC])
    expect(m.okxConnection.get()).toEqual({ status: 'live', since: 1_001_000 })
  })

  it('records why OKX refused a subscription', async () => {
    const m = await load()
    const store = m.bookFeed('NOPE-USDT-SWAP')
    store.subscribe(() => {})
    const ws = FakeWS.instances[0]
    ws.open()
    ws.push({
      event: 'error',
      code: '60018',
      msg: "Wrong URL or channel:books,instId:NOPE-USDT-SWAP doesn't exist",
      arg: { channel: 'books', instId: 'NOPE-USDT-SWAP' },
    })
    flush()
    expect(store.get().error).toContain("doesn't exist")
  })

  it('ignores a malformed frame and keeps the connection', async () => {
    const m = await load()
    const store = m.bookFeed(BTC.instId)
    store.subscribe(() => {})
    const ws = FakeWS.instances[0]
    ws.open()
    ws.push(frame(BTC, 'snapshot', 1, -1, [level('100', '5')], [level('101', '3')]))
    expect(() => ws.push('{not json')).not.toThrow()
    expect(() => ws.push(JSON.stringify(null))).not.toThrow()
    expect(() => ws.push({ arg: BTC })).not.toThrow()
    flush()
    expect(store.get().seq).toBe(1)
    expect(FakeWS.instances).toHaveLength(1)
  })

  it('keeps instruments apart: switching never leaks one book into another', async () => {
    const m = await load()
    const btc = m.bookFeed(BTC.instId)
    const eth = m.bookFeed(ETH.instId)
    expect(btc).not.toBe(eth)
    const stopBtc = btc.subscribe(() => {})
    const ws = FakeWS.instances[0]
    ws.open()
    ws.push(frame(BTC, 'snapshot', 1, -1, [level('100', '5')], [level('101', '3')]))
    flush()

    stopBtc() // the chart moved to ETH
    const stopEth = eth.subscribe(() => {})
    expect(ws.ops('unsubscribe')[0].args).toEqual([BTC])
    expect(ws.ops('subscribe').at(-1)!.args).toEqual([ETH])
    expect(eth.get().bids.size).toBe(0)
    expect(eth.get().seq).toBe(-1)
    ws.push(frame(BTC, 'update', 2, 1, [level('100', '9')])) // a late BTC frame
    flush()
    expect(eth.get().bids.size).toBe(0)
    stopEth()
  })
})
