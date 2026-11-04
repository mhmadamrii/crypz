import { describe, expect, it } from 'vitest'
import type { Candle } from '@crypz/exchanges'
import { outcomeOf, priorOf, SCENARIO_ORDER, type Prior } from './outcome'

const closes = (...c: number[]): Candle[] => c.map((x, i) => ({ time: i, open: x, high: x, low: x, close: x }))
const refs = { high: 110, low: 90 }

describe('outcomeOf: the single label of a window', () => {
  it('labels a close above the high a continuation from an up structure, a reversal otherwise', () => {
    expect(outcomeOf(closes(100, 112), refs, 'up')).toBe('bullish_continuation')
    expect(outcomeOf(closes(100, 112), refs, 'down')).toBe('bullish_reversal')
    expect(outcomeOf(closes(100, 112), refs, 'range')).toBe('bullish_reversal')
  })

  it('labels a close below the low a continuation from a down structure, a reversal otherwise', () => {
    expect(outcomeOf(closes(100, 88), refs, 'down')).toBe('bearish_continuation')
    expect(outcomeOf(closes(100, 88), refs, 'up')).toBe('bearish_reversal')
    expect(outcomeOf(closes(100, 88), refs, 'range')).toBe('bearish_reversal')
  })

  it('calls a break that ended back inside a failed breakout, on either side', () => {
    expect(outcomeOf(closes(100, 115, 105), refs, 'up')).toBe('failed_breakout')
    expect(outcomeOf(closes(100, 85, 95), refs, 'down')).toBe('failed_breakout')
  })

  it('calls a window that never closed beyond a level a range, even if a wick went through', () => {
    expect(outcomeOf(closes(100, 105, 95), refs, 'up')).toBe('range')
    const wick: Candle[] = [{ time: 0, open: 100, high: 130, low: 70, close: 100 }]
    expect(outcomeOf(wick, refs, 'range')).toBe('range')
  })

  it('judges the end of the window first: a break up that ends below the low is a down outcome', () => {
    expect(outcomeOf(closes(100, 115, 85), refs, 'up')).toBe('bearish_reversal')
  })

  it('gives every possible window exactly one label from the six', () => {
    const priors: Prior[] = ['up', 'down', 'range']
    const seen = new Set<string>()
    for (const prior of priors)
      for (const path of [[100], [120], [80], [100, 120, 100], [100, 80, 100], [100, 120, 80], [100, 80, 120]]) {
        const label = outcomeOf(closes(...path), refs, prior)
        expect(SCENARIO_ORDER).toContain(label)
        seen.add(label!)
      }
    expect(seen.size).toBe(6)
  })

  it('has no label for an empty window', () => {
    expect(outcomeOf([], refs, 'up')).toBeNull()
  })
})

describe('priorOf', () => {
  it('maps structure to the three priors, a transition going the way it broke', () => {
    expect(priorOf('bullish', null)).toBe('up')
    expect(priorOf('bearish', null)).toBe('down')
    expect(priorOf('ranging', null)).toBe('range')
    expect(priorOf('unclear', null)).toBe('range')
    expect(priorOf('transitioning', 'up')).toBe('up')
    expect(priorOf('transitioning', 'down')).toBe('down')
  })
})
