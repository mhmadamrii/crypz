import { describe, expect, it } from 'vitest'
import type { Candle } from '@crypz/exchanges'
import { emaOf, macd, smaOf, stochastic } from './oscillators'

const bars = (closes: number[], spread = 1): Candle[] =>
  closes.map((c, i) => ({ time: i * 60_000, open: c, high: c + spread, low: c - spread, close: c }))
// a deterministic wobble with a drift, so no two windows look alike
const wave = (n: number) =>
  bars(Array.from({ length: n }, (_, i) => 100 + i * 0.2 + 6 * Math.sin(i / 3) + 2 * Math.cos(i / 7)))
const defined = (xs: number[]) => xs.filter((x) => !Number.isNaN(x))

describe('emaOf and smaOf', () => {
  it('seeds the EMA with the simple average of the first period, then smooths', () => {
    const e = emaOf([1, 2, 3, 4, 5], 3)
    expect(e.slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(e[2]).toBe(2)
    expect(e[3]).toBe(3) // 4 × ½ + 2 × ½
    expect(e[4]).toBe(4)
  })

  it('starts an EMA of an EMA where its input starts', () => {
    const inner = emaOf([1, 2, 3, 4, 5, 6, 7], 3) // first value at index 2
    const outer = emaOf(inner, 2)
    expect(Number.isNaN(outer[2])).toBe(true)
    expect(Number.isNaN(outer[3])).toBe(false)
  })

  it('has nothing until there are enough values', () => {
    expect(defined(emaOf([1, 2], 3))).toEqual([])
    expect(defined(smaOf([1, 2], 3))).toEqual([])
  })

  it('averages the last period values', () => {
    expect(smaOf([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4])
  })
})

describe('macd', () => {
  it('is flat zero on a flat price', () => {
    const m = macd(bars(new Array(80).fill(50)))
    expect(defined(m.macd).every((v) => Math.abs(v) < 1e-9)).toBe(true)
    expect(defined(m.hist).every((v) => Math.abs(v) < 1e-9)).toBe(true)
  })

  it('warms up in the standard places: the line at the slow length, the signal a signal-length later', () => {
    const m = macd(wave(80))
    expect(m.macd.findIndex((v) => !Number.isNaN(v))).toBe(25) // 26th bar
    expect(m.signal.findIndex((v) => !Number.isNaN(v))).toBe(33) // 9 more
    expect(m.hist.findIndex((v) => !Number.isNaN(v))).toBe(33)
  })

  it('is positive while price rises and negative while it falls', () => {
    const up = macd(bars(Array.from({ length: 80 }, (_, i) => 100 + i)))
    expect(up.macd.at(-1)).toBeGreaterThan(0)
    const down = macd(bars(Array.from({ length: 80 }, (_, i) => 200 - i)))
    expect(down.macd.at(-1)).toBeLessThan(0)
  })

  it('is the gap between its two averages, and the histogram is the line minus its signal', () => {
    const c = wave(80)
    const m = macd(c)
    const close = c.map((k) => k.close)
    const i = 60
    expect(m.macd[i]).toBeCloseTo(emaOf(close, 12)[i] - emaOf(close, 26)[i], 10)
    expect(m.hist[i]).toBeCloseTo(m.macd[i] - m.signal[i], 10)
  })

  it('takes other lengths', () => {
    const m = macd(wave(80), 5, 13, 5)
    expect(m.macd.findIndex((v) => !Number.isNaN(v))).toBe(12)
    expect(m.signal.findIndex((v) => !Number.isNaN(v))).toBe(16)
  })
})

describe('stochastic', () => {
  it('reads 100 at the top of the range and 0 at the bottom, unsmoothed', () => {
    const c: Candle[] = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 10, high: 20, low: 10, close: 15 }))
    c[19] = { time: 19, open: 10, high: 20, low: 10, close: 20 }
    expect(stochastic(c, 14, 1, 3).k[19]).toBe(100)
    c[19] = { time: 19, open: 10, high: 20, low: 10, close: 10 }
    expect(stochastic(c, 14, 1, 3).k[19]).toBe(0)
  })

  it('reads 50 when the window has no range', () => {
    const flat: Candle[] = Array.from({ length: 20 }, (_, i) => ({ time: i, open: 5, high: 5, low: 5, close: 5 }))
    expect(stochastic(flat, 14, 1, 3).k[19]).toBe(50)
  })

  it('smooths %K and averages it into %D, each starting later', () => {
    const s = stochastic(wave(60), 14, 3, 3)
    expect(s.k.findIndex((v) => !Number.isNaN(v))).toBe(15) // 14 for the range, 2 more to smooth
    expect(s.d.findIndex((v) => !Number.isNaN(v))).toBe(17)
    expect(defined(s.k).every((v) => v >= 0 && v <= 100)).toBe(true)
    expect(defined(s.d).every((v) => v >= 0 && v <= 100)).toBe(true)
  })

  it('takes %D smoothing as its own setting: 1 leaves %D equal to %K, 5 starts it later', () => {
    const same = stochastic(wave(60), 14, 3, 1)
    expect(same.d.every((v, i) => (Number.isNaN(v) ? Number.isNaN(same.k[i]) : v === same.k[i]))).toBe(true)
    expect(stochastic(wave(60), 14, 3, 5).d.findIndex((v) => !Number.isNaN(v))).toBe(19) // 15 + 4
  })

  it('treats smoothing of 1 as the fast stochastic', () => {
    const s = stochastic(wave(60), 14, 1, 3)
    expect(s.k.findIndex((v) => !Number.isNaN(v))).toBe(13)
  })
})

describe('no look-ahead: a value never depends on bars after it', () => {
  // this is what makes them safe in replay: revealing one more candle cannot change anything already printed
  it('gives the same values on a prefix as on the whole series', () => {
    const all = wave(120)
    for (const n of [40, 70, 99]) {
      const part = all.slice(0, n)
      const m = macd(all)
      const p = macd(part)
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(m.macd[i])) expect(Number.isNaN(p.macd[i])).toBe(true)
        else expect(p.macd[i]).toBeCloseTo(m.macd[i], 10)
        if (!Number.isNaN(m.signal[i])) expect(p.signal[i]).toBeCloseTo(m.signal[i], 10)
      }
      const s = stochastic(all)
      const q = stochastic(part)
      for (let i = 0; i < n; i++) {
        if (Number.isNaN(s.k[i])) expect(Number.isNaN(q.k[i])).toBe(true)
        else expect(q.k[i]).toBeCloseTo(s.k[i], 10)
        if (!Number.isNaN(s.d[i])) expect(q.d[i]).toBeCloseTo(s.d[i], 10)
      }
    }
  })
})
