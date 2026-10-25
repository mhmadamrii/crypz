import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { summarize, type Instrument } from '@/lib/book'
import { LiquidityView, type LiquidityViewProps } from './book-liquidity'

// the view is rendered on its own: no queries, no socket
vi.mock('@/lib/queries', () => ({ instrumentQuery: () => ({}) }))

const unit: Instrument = { id: 'BTC-USDT-SWAP', tickSz: 1, unit: 1, inverse: false }
const summary = summarize(
  new Map([
    ['99', '1000'],
    ['98', '200'],
  ]),
  new Map([
    ['101', '500'],
    ['102', '50'],
  ]),
  unit,
  { ref: 100, range: 0.05, metric: 'notional', group: 0, top: 5 },
)!

const base: LiquidityViewProps = {
  symbol: 'BTC-USDT-SWAP',
  state: 'live',
  error: null,
  summary,
  refKind: 'last',
  metric: 'notional',
  range: 0.05,
  at: 10_000,
  now: 12_000,
}
const html = (over: Partial<LiquidityViewProps> = {}) => renderToStaticMarkup(<LiquidityView {...base} {...over} />)

describe('LiquidityView', () => {
  it('shows live depth, imbalance and the biggest levels with their distance from the price', () => {
    const out = html()
    expect(out).toContain('Live')
    expect(out).toContain('updated 2s ago')
    expect(out).toContain('within ±5%')
    expect(out).toContain('Last')
    // bids: 1000 × 99 + 200 × 98 = $118.6k; asks: 500 × 101 + 50 × 102 = $55.6k (compact: $119k, $56k)
    expect(out).toContain('$119k')
    expect(out).toContain('$56k')
    // (118.6 − 55.6) / (118.6 + 55.6) = +36%
    expect(out).toMatch(/\+36%/)
    expect(out).toContain('Largest bids')
    expect(out).toContain('Largest asks')
    expect(out).toContain('−1.00%') // the best bid sits 1% under the price
    expect(out).toContain('+1.00%')
  })

  it('says "Mid" when there is no market price to measure from', () => {
    expect(html({ refKind: 'mid' })).toContain('Mid')
  })

  it('shows base-coin sizes when asked', () => {
    const out = html({ metric: 'base', summary: { ...summary, bid: { base: 1200, notional: 0, levels: 2 } } })
    expect(out).toContain('1.2k BTC')
  })

  it('shows loading, not numbers, before the book arrives', () => {
    const out = html({ state: 'loading', summary: null, at: 0 })
    expect(out).toContain('Loading')
    expect(out).toContain('Waiting for the OKX order book')
    expect(out).not.toContain('Largest bids')
  })

  it('hides the last book while disconnected and says how old it is', () => {
    const out = html({ state: 'disconnected', summary: null })
    expect(out).toContain('Offline')
    expect(out).toMatch(/last book \(2s ago\) is hidden/)
    expect(out).not.toContain('$119k')
  })

  it('hides a stale book and says for how long it has been silent', () => {
    const out = html({ state: 'stale', summary: null, now: 10_000 + 125_000 })
    expect(out).toContain('Stale')
    expect(out).toMatch(/No update for 2m/)
  })

  it('shows an error over everything else', () => {
    const out = html({ error: 'OKX refused X: nope' })
    expect(out).toContain('Error')
    expect(out).toContain('OKX refused X: nope')
    expect(out).not.toContain('Largest bids')
  })

  it('tells an empty side from missing data', () => {
    expect(html({ summary: null })).toContain('empty on one side')
  })

  it('shows zero depth, with no imbalance, when nothing rests in range', () => {
    const none = summarize(new Map([['99', '1']]), new Map([['101', '1']]), unit, {
      ref: 100,
      range: 0.001,
      metric: 'notional',
      group: 0,
      top: 5,
    })!
    const out = html({ summary: none })
    expect(out).toContain('no size in range')
    expect(out).toContain('None in range')
    expect(out).toContain('$0')
  })
})
