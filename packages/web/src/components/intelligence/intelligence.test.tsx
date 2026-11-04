import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { analyze, tagFor } from '@/lib/intelligence/analyze'
import { input, SYMBOL } from '@/lib/intelligence/fixtures'
import { EvidenceList } from './evidence-list'
import { LevelsLadder } from './levels-ladder'
import { MarketStateStrip } from './market-state'
import { ScenarioList } from './scenario-list'
import { StatusBar } from './status-bar'

// the evidence list names widgets from the registry, which pulls in the whole workspace; only their titles matter here
vi.mock('@/lib/queries', async (orig) => ({ ...(await orig<object>()) }))

const full = analyze(input())
const html = (n: React.ReactElement) => renderToStaticMarkup(n)

describe('the Market Intelligence sections', () => {
  it('shows scenarios as a ranked bias, with no probability', () => {
    const out = html(<ScenarioList a={full} />)
    expect(out).toContain('Qualitative bias')
    expect(out).toContain('Not probabilities')
    expect(out).toContain('uncalibrated')
    expect(out).toContain('Favored')
    for (const name of [
      'Bullish continuation',
      'Bearish continuation',
      'Bullish reversal',
      'Bearish reversal',
      'Range',
      'Failed breakout',
    ])
      expect(out).toContain(name)
  })

  it('shows a scenario the structure rules out only its definition, not a trigger it could never have', () => {
    const out = html(<ScenarioList a={full} />)
    const dead = out.split('<details').filter((d) => d.includes('Not applicable'))
    expect(dead.length).toBeGreaterThan(0)
    for (const d of dead) {
      expect(d).toContain('What it means')
      expect(d).not.toContain('Confirmation')
      expect(d).not.toContain('Supporting evidence')
    }
  })

  it('gives each scenario its evidence, confirmation and invalidation, and marks the impossible ones', () => {
    const out = html(<ScenarioList a={full} />)
    expect(out).toContain('Supporting evidence')
    expect(out).toContain('Conflicting evidence')
    expect(out).toContain('Confirmation')
    expect(out).toContain('Invalidation')
    expect(out).toContain('Not applicable')
  })

  it('keeps the current state apart from the forecast', () => {
    const out = html(<MarketStateStrip a={full} />)
    for (const label of ['Structure', 'Trend', 'Momentum', 'Volatility', 'Liquidity', 'Derivatives'])
      expect(out).toContain(label)
    expect(out).toContain('observation, not a forecast')
    expect(out).not.toContain('Favored')
  })

  it('says so instead of forcing a label when there is too little data', () => {
    const none = (tag: string) => ({ data: null, at: null, tag })
    const thin = analyze(input({ candles: { ...input().candles, data: input().candles.data!.slice(-20) } }))
    expect(thin.dataQuality.status).toBe('insufficient')
    expect(html(<MarketStateStrip a={thin} />)).toContain('Insufficient data')
    expect(html(<LevelsLadder a={thin} />)).toBe('')
    void none
  })

  it('lists levels with their source and age, and warns that resting orders can be cancelled', () => {
    const out = html(<LevelsLadder a={full} />)
    expect(out).toContain('Price')
    expect(out).toContain('can be cancelled')
    expect(out).toMatch(/Last unbroken swing (high|low)/)
    expect(out).toContain('s ago')
  })

  it('groups the widgets under five engines, each with a state word and a freshness', () => {
    const out = html(<EvidenceList a={full} onOpen={() => {}} />)
    for (const t of ['Market structure', 'Liquidity', 'Aggressive flow', 'Positioning', 'Forced flows'])
      expect(out).toContain(t)
    expect(out).toMatch(/Bullish|Bearish|Neutral|Mixed/)
    expect(out).toContain('Open Chart')
    expect(out).toContain('Open OKX liquidity')
    expect(out).toContain('Context only')
  })

  it('shows data quality and every source, and names what is not being read', () => {
    const base = input()
    const degraded = analyze(input({ taker: { ...base.taker, at: Date.now() - 3_600_000 } }))
    const out = html(<StatusBar a={degraded} />)
    expect(out).toContain('Degraded')
    expect(out).toContain('Taker volume')
    expect(out).toContain('Stale')
    expect(out).toContain(SYMBOL)
    expect(out).toContain('read on 15m bars')
    void tagFor
  })
})
