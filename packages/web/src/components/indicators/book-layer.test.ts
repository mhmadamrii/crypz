import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Book, Store } from '@/lib/okx-ws'
import type { Instrument } from '@/lib/book'
import type { Palette } from '@/components/trade/chart-kit'
import { indicators } from '@/lib/indicators/store'
import { attachBookLayer } from './book-layer'

const palette = {
  fg: 'rgba(255,255,255,1)',
  muted: 'rgba(150,150,150,1)',
  up: 'rgba(0,200,100,1)',
  down: 'rgba(230,60,60,1)',
} as unknown as Palette
const spec: Instrument = { id: 'BTC-USDT-SWAP', tickSz: 1, unit: 1, inverse: false }

const bookOf = (over: Partial<Book> = {}): Book => ({
  bids: new Map([
    ['99', '1000'],
    ['98', '100'],
  ]),
  asks: new Map([
    ['101', '500'],
    ['102', '50'],
  ]),
  ts: 1,
  seq: 5,
  at: 1000,
  ...over,
})

// a store the test can push into, counting how many consumers hold it
function fakeFeed() {
  const stores = new Map<string, { book: Book; listeners: Set<() => void> }>()
  const feed = (id: string): Store<Book> => {
    if (!stores.has(id)) stores.set(id, { book: bookOf(), listeners: new Set() })
    const s = stores.get(id)!
    return {
      get: () => s.book,
      subscribe: (fn) => {
        s.listeners.add(fn)
        return () => s.listeners.delete(fn)
      },
    }
  }
  return {
    feed: vi.fn(feed),
    listeners: (id: string) => stores.get(id)?.listeners.size ?? 0,
    push: (id: string, book: Book) => {
      const s = stores.get(id)!
      s.book = book
      for (const l of s.listeners) l()
    },
  }
}

function setup(over: { status?: 'live' | 'retrying'; since?: number; now?: number } = {}) {
  const f = fakeFeed()
  let conn: { status: 'live' | 'retrying'; since: number } = { status: over.status ?? 'live', since: over.since ?? 0 }
  const connListeners = new Set<() => void>()
  let primitive: {
    attached: (p: { requestUpdate: () => void }) => void
    paneViews: () => { renderer: () => { draw: (t: unknown) => void } }[]
  }
  const requestUpdate = vi.fn()
  const series = {
    attachPrimitive: vi.fn((p) => {
      primitive = p
      p.attached({ requestUpdate })
    }),
    detachPrimitive: vi.fn(),
    // price → pixel: higher price, higher up, 10px per unit, all inside the 2000px pane
    priceToCoordinate: (price: number) => 2000 - price * 10,
  }
  const clock = { now: over.now ?? 2000 }
  const layer = attachBookLayer({
    chart: {} as never,
    series: series as never,
    // time → pixel: 10ms to the pixel
    x: (time: number) => time / 10,
    palette,
    font: 'monospace',
    feed: f.feed,
    connection: { get: () => conn, subscribe: (fn) => (connListeners.add(fn), () => connListeners.delete(fn)) },
    now: () => clock.now,
  })
  const calls = { fills: [] as { style: string; w: number }[], texts: [] as string[] }
  const ctx = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    fillRect(_x: number, _y: number, w: number) {
      calls.fills.push({ style: this.fillStyle, w })
    },
    fillText(t: string) {
      calls.texts.push(t)
    },
  }
  const draw = () => {
    calls.fills = []
    calls.texts = []
    primitive
      .paneViews()[0]
      .renderer()
      .draw({
        useMediaCoordinateSpace: (cb: (s: unknown) => void) =>
          cb({ context: ctx, mediaSize: { width: 1000, height: 2000 } }),
      })
  }
  const fire = () => connListeners.forEach((fn) => fn())
  return {
    f,
    layer,
    series,
    draw,
    calls,
    clock,
    requestUpdate,
    connListeners,
    fire,
    setConn: (c: typeof conn) => (conn = c),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  indicators.setBook({
    on: true,
    style: 'bars',
    ended: true,
    sides: 'both',
    range: 0.05,
    minShare: 0,
    maxLevels: 10,
    group: 0,
    labels: true,
  })
})
afterEach(() => {
  indicators.setBook({ on: false })
  vi.useRealTimers()
})

describe('the OKX liquidity layer', () => {
  it('draws bids in up and asks in down, longer for bigger levels, and labels the biggest', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.draw()
    const bids = t.calls.fills.filter((f) => f.style.startsWith('rgba(0,200,100'))
    const asks = t.calls.fills.filter((f) => f.style.startsWith('rgba(230,60,60'))
    expect(bids).toHaveLength(2)
    expect(asks).toHaveLength(2)
    // the biggest level (1000 at 99) reaches furthest; the 100 at 98 is a tenth of it
    expect(Math.max(...bids.map((b) => b.w))).toBeGreaterThan(Math.min(...bids.map((b) => b.w)))
    expect(t.calls.texts.some((x) => x.includes('99'))).toBe(true)
    t.layer.dispose()
  })

  it('leaves labels off when switched off', () => {
    const t = setup()
    indicators.setBook({ labels: false })
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.draw()
    expect(t.calls.texts).toEqual([])
    t.layer.dispose()
  })

  it('draws no liquidity, only why, while the feed is offline', () => {
    const t = setup({ status: 'retrying' })
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.draw()
    expect(t.calls.fills).toEqual([])
    expect(t.calls.texts.join(' ')).toMatch(/offline/)
    t.layer.dispose()
  })

  it('hides a book that has gone silent, and shows it again when it speaks', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.clock.now = 1000 + 76_000
    t.draw()
    expect(t.calls.fills).toEqual([])
    expect(t.calls.texts.join(' ')).toMatch(/no update/)
    t.f.push('BTC-USDT-SWAP', bookOf({ at: t.clock.now }))
    t.draw()
    expect(t.calls.fills.length).toBeGreaterThan(0)
    t.layer.dispose()
  })

  it('says it is loading until the instrument spec arrives, and reports a spec that failed', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', null)
    t.draw()
    expect(t.calls.fills).toEqual([])
    expect(t.calls.texts.join(' ')).toMatch(/loading/)
    t.layer.setInstrument('BTC-USDT-SWAP', null, true)
    t.draw()
    expect(t.calls.texts.join(' ')).toMatch(/could not load/)
    t.layer.dispose()
  })

  it('tells empty from unavailable', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.f.push('BTC-USDT-SWAP', bookOf({ bids: new Map(), asks: new Map() }))
    t.draw()
    expect(t.calls.texts.join(' ')).toMatch(/empty book/)
    t.layer.dispose()
  })

  it('redraws when the book changes, without rebuilding anything', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    const before = t.requestUpdate.mock.calls.length
    t.f.push('BTC-USDT-SWAP', bookOf({ seq: 6 }))
    expect(t.requestUpdate.mock.calls.length).toBeGreaterThan(before)
    expect(t.series.attachPrimitive).toHaveBeenCalledOnce()
    t.layer.dispose()
  })

  it('moves to the new instrument and lets go of the old one', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(1)
    t.layer.setInstrument('ETH-USDT-SWAP', { ...spec, id: 'ETH-USDT-SWAP' })
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(0)
    expect(t.f.listeners('ETH-USDT-SWAP')).toBe(1)
    t.layer.dispose()
  })

  it('holds no subscription while the indicator is off, and takes one when it is turned on', () => {
    indicators.setBook({ on: false })
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    expect(t.f.feed).not.toHaveBeenCalled()
    indicators.setBook({ on: true })
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(1)
    indicators.setBook({ on: false })
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(0)
    t.layer.dispose()
  })

  it('cleans up completely on dispose', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    expect(vi.getTimerCount()).toBe(1)
    t.layer.dispose()
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(0)
    expect(t.connListeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(t.series.detachPrimitive).toHaveBeenCalledOnce()
    // a later settings change must not wake a disposed layer
    indicators.setBook({ on: false })
    indicators.setBook({ on: true })
    expect(t.f.listeners('BTC-USDT-SWAP')).toBe(0)
  })
})

describe('the OKX liquidity layer, as lines', () => {
  beforeEach(() => indicators.setBook({ style: 'lines' }))
  const alpha = (style: string) => Number(/,([\d.]+)\)$/.exec(style)![1])
  const without = (id: string, px: string) => {
    const b = bookOf({ at: 3000 })
    b.bids.delete(px)
    return { id, b }
  }

  it('draws a line per level from when it first appeared to the right edge', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.draw()
    expect(t.calls.fills).toHaveLength(4)
    // the book was first seen at at = 1000, which is x = 100 on this axis: lines run 100 → 1000
    expect(t.calls.fills.every((f) => f.w === 900)).toBe(true)
    t.layer.dispose()
  })

  it('stops a level that went where it went, fades it, and drops it when asked', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    const { id, b } = without('BTC-USDT-SWAP', '98')
    t.f.push(id, b)
    t.draw()
    expect(t.calls.fills).toHaveLength(4)
    // the pulled bid ran from x = 100 to x = 300, not on to the edge
    const ended = t.calls.fills.filter((f) => f.w === 200)
    expect(ended).toHaveLength(1)
    const kept = t.calls.fills.filter((f) => f.w === 900)
    expect(alpha(ended[0].style)).toBeLessThan(Math.max(...kept.map((f) => alpha(f.style))))
    indicators.setBook({ ended: false })
    t.draw()
    expect(t.calls.fills).toHaveLength(3)
    t.layer.dispose()
  })

  it('draws stronger, thicker lines for bigger levels', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.draw()
    const alphas = t.calls.fills.map((f) => alpha(f.style))
    expect(Math.max(...alphas)).toBeGreaterThan(Math.min(...alphas))
  })

  it('ends every line at the last update when the feed drops, and never bridges the gap', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.setConn({ status: 'retrying', since: 0 })
    t.clock.now = 9000
    t.fire()
    t.draw()
    // status line only says why; the old lines stay as ended ones, stopping at x = 100 (their last update)
    expect(t.calls.texts.join(' ')).toMatch(/offline/)
    expect(t.calls.fills.every((f) => f.w === 0 || f.w < 900)).toBe(true)
    indicators.setBook({ ended: false })
    t.draw()
    expect(t.calls.fills).toEqual([])

    // back online: fresh lines start at the new update, not at the old one
    t.setConn({ status: 'live', since: 9000 })
    t.clock.now = 9500
    t.f.push('BTC-USDT-SWAP', bookOf({ at: 9200 }))
    t.draw()
    expect(t.calls.fills).toHaveLength(4)
    expect(t.calls.fills.every((f) => f.w === 1000 - 920)).toBe(true)
    t.layer.dispose()
  })

  it('starts again on another instrument', () => {
    const t = setup()
    t.layer.setInstrument('BTC-USDT-SWAP', spec)
    t.layer.setInstrument('ETH-USDT-SWAP', { ...spec, id: 'ETH-USDT-SWAP' })
    t.draw()
    // the ETH book was seen at at = 1000 as well, but nothing carried over from BTC: four lines, not eight
    expect(t.calls.fills).toHaveLength(4)
    t.layer.dispose()
  })
})
