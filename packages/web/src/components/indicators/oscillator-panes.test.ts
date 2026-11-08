import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle } from '@crypz/exchanges'
import type { LW, Palette } from '@/components/trade/chart-kit'
import { indicators } from '@/lib/indicators/store'
import { attachOscillators } from './oscillator-panes'

// A stand-in for the chart's pane and series API that records what is asked of it.
type Primitive = {
  attached: (p: { requestUpdate: () => void }) => void
  paneViews: () => { renderer: () => { draw: (t: unknown) => void } }[]
}

type FakeSeries = {
  kind: string
  pane: () => number
  options: Record<string, unknown>
  data: { time: number; value: number; color?: string }[]
  lines: { price: number; color: string; axis?: boolean }[]
  scale: Record<string, unknown>
  primitives: Primitive[]
  attachPrimitive: (p: Primitive) => void
  detachPrimitive: (p: Primitive) => void
  priceScale: () => { applyOptions: (o: Record<string, unknown>) => void }
  /** Price to pixel: higher price, higher up, 1px per unit, zero at y = 200. */
  priceToCoordinate: (price: number) => number
  setData: (d: FakeSeries['data']) => void
  applyOptions: (o: Record<string, unknown>) => void
  createPriceLine: (o: { price: number; color: string; axisLabelVisible?: boolean }) => {
    applyOptions: (o: { color: string }) => void
  }
}

function fakeChart() {
  const panes: { series: FakeSeries[]; stretch: number }[] = [{ series: [], stretch: 1 }]
  const all: FakeSeries[] = []
  const chart = {
    panes: () => panes.map((p) => ({ getSeries: () => p.series, setStretchFactor: (n: number) => (p.stretch = n) })),
    addSeries(def: { kind: string }, options: Record<string, unknown>, paneIndex = 0) {
      if (paneIndex > panes.length) throw new Error('pane index out of range')
      if (paneIndex === panes.length) panes.push({ series: [], stretch: 1 })
      const s: FakeSeries = {
        kind: def.kind,
        pane: () => panes.findIndex((p) => p.series.includes(s)),
        options: { ...options },
        data: [],
        lines: [],
        scale: {},
        primitives: [],
        attachPrimitive: (prim) => {
          s.primitives.push(prim)
          prim.attached({ requestUpdate: () => {} })
        },
        detachPrimitive: (prim) => (s.primitives = s.primitives.filter((x) => x !== prim)),
        priceScale: () => ({ applyOptions: (o) => Object.assign(s.scale, o) }),
        priceToCoordinate: (price) => 200 - price,
        setData: (d) => (s.data = d),
        applyOptions: (o) => Object.assign(s.options, o),
        createPriceLine: (o) => {
          const l = { price: o.price, color: o.color, axis: o.axisLabelVisible }
          s.lines.push(l)
          return { applyOptions: (n) => Object.assign(l, n) }
        },
      }
      panes[paneIndex].series.push(s)
      all.push(s)
      return s
    },
    removeSeries(s: FakeSeries) {
      for (const p of panes) p.series = p.series.filter((x) => x !== s)
    },
    removePane(i: number) {
      panes.splice(i, 1)
    },
  }
  return { chart, panes, all }
}

const lw = {
  LineSeries: { kind: 'line' },
  HistogramSeries: { kind: 'hist' },
  LineStyle: { Solid: 0, Dashed: 2 },
} as unknown as LW
const palette = {
  fg: 'rgba(255,255,255,1)',
  muted: 'rgba(150,150,150,1)',
  up: 'rgba(0,200,100,1)',
  down: 'rgba(230,60,60,1)',
} as unknown as Palette

const wave = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.2 + 6 * Math.sin(i / 3)
    return { time: 1_700_000_000_000 + i * 60_000, open: c, high: c + 1, low: c - 1, close: c }
  })

function setup(initial = 120) {
  const f = fakeChart()
  let candles = wave(initial)
  const layer = attachOscillators({ lw, chart: f.chart as never, candles: () => candles, palette })
  return { ...f, layer, reveal: (n: number) => ((candles = wave(n)), layer.refresh()) }
}

beforeEach(() => indicators.setMacd({ on: false, preset: '12/26/9' }))
afterEach(() => {
  indicators.setMacd({ on: false })
  indicators.setStoch({ on: false, length: 14, smooth: 3, d: 3 })
})

describe('the oscillator panes', () => {
  it('adds nothing while both indicators are off', () => {
    const t = setup()
    expect(t.panes).toHaveLength(1)
    expect(t.all).toHaveLength(0)
    t.layer.dispose()
  })

  it('puts MACD in a pane of its own: histogram, line and signal, filled from the candles', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    expect(t.panes).toHaveLength(2)
    expect(t.panes[1].series.map((s) => s.kind)).toEqual(['hist', 'line', 'line'])
    const [hist, line, signal] = t.panes[1].series
    // the line starts at the 26th bar, the signal and histogram nine bars later
    expect(line.data).toHaveLength(120 - 25)
    expect(signal.data).toHaveLength(120 - 33)
    expect(hist.data).toHaveLength(120 - 33)
    expect(line.options.title).toBe('MACD 12/26')
    t.layer.dispose()
  })

  it('colours the histogram by sign: up above zero, down below', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    const hist = t.panes[1].series[0]
    for (const bar of hist.data) expect(bar.color).toMatch(bar.value >= 0 ? /^rgba\(0,200,100/ : /^rgba\(230,60,60/)
    expect(new Set(hist.data.map((b) => b.value >= 0)).size).toBe(2)
    t.layer.dispose()
  })

  it('puts the stochastic in its own pane on a fixed 0 to 100 scale with bands at 20 and 80', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    expect(t.panes).toHaveLength(2)
    const [k, d] = t.panes[1].series
    expect(k.lines.map((l) => l.price)).toEqual([20, 80])
    const scale = (k.options.autoscaleInfoProvider as () => { priceRange: { minValue: number; maxValue: number } })()
    expect(scale.priceRange).toEqual({ minValue: 0, maxValue: 100 })
    expect(k.data.every((p) => p.value >= 0 && p.value <= 100)).toBe(true)
    expect(d.data.length).toBeLessThan(k.data.length) // %D starts later
    expect(k.options.title).toBe('%K 14/3')
    expect(d.options.title).toBe('%D 3')
    t.layer.dispose()
  })

  it('stacks both panes under the price, the price pane taller', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    expect(t.panes).toHaveLength(3)
    expect(t.panes[0].stretch).toBeGreaterThan(t.panes[1].stretch)
    expect(t.panes[1].stretch).toBe(t.panes[2].stretch)
    t.layer.dispose()
  })

  it('removes a pane when its indicator goes off, leaving the other where it is', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    indicators.setMacd({ on: false })
    expect(t.panes).toHaveLength(2)
    expect(t.panes[1].series.map((s) => s.kind)).toEqual(['line', 'line']) // the stochastic's
    indicators.setStoch({ on: false })
    expect(t.panes).toHaveLength(1)
    t.layer.dispose()
  })

  it('recomputes the stochastic when its length, %K smoothing or %D smoothing changes', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    const [k, d] = t.panes[1].series
    const kLen = k.data.length
    const dLen = d.data.length
    indicators.setStoch({ length: 21 })
    expect(k.data.length).toBe(kLen - 7) // a longer range needs more bars before the first value
    indicators.setStoch({ length: 14, smooth: 5 })
    expect(k.options.title).toBe('%K 14/5')
    expect(k.data.length).toBe(kLen - 2) // two more bars of smoothing
    indicators.setStoch({ smooth: 3, d: 5 })
    expect(d.options.title).toBe('%D 5')
    expect(d.data.length).toBe(dLen - 2)
    expect(t.panes).toHaveLength(2)
    t.layer.dispose()
  })

  it('recomputes when a setting changes, in place', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    const line = t.panes[1].series[1]
    const before = line.data.length
    indicators.setMacd({ preset: '5/35/5' })
    expect(t.panes).toHaveLength(2)
    expect(line.options.title).toBe('MACD 5/35')
    expect(line.data.length).not.toBe(before)
    t.layer.dispose()
  })

  it('shows only what the revealed candles can know: a step adds a bar and changes nothing before it', () => {
    const t = setup(80)
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    const macdLine = t.panes[1].series[1]
    const k = t.panes[2].series[0]
    const macdBefore = [...macdLine.data]
    const kBefore = [...k.data]
    t.reveal(81)
    expect(macdLine.data).toHaveLength(macdBefore.length + 1)
    expect(k.data).toHaveLength(kBefore.length + 1)
    macdBefore.forEach((p, i) => expect(macdLine.data[i].value).toBeCloseTo(p.value, 10))
    kBefore.forEach((p, i) => expect(k.data[i].value).toBeCloseTo(p.value, 10))
    t.layer.dispose()
  })

  it('takes the new palette on a theme change', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    t.layer.refresh({ ...palette, fg: 'rgba(1,2,3,1)', muted: 'rgba(4,5,6,1)' } as Palette)
    expect(t.panes[1].series[1].options.color).toBe('rgba(1,2,3,1)')
    expect(t.panes[2].series[1].options.color).toBe('rgba(1,2,3,1)')
    expect(t.panes[2].series[0].lines[0].color).toMatch(/^rgba\(1,2,3/)
    t.layer.dispose()
  })

  it('handles a chart with no candles yet', () => {
    const t = setup(0)
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    expect(t.panes[1].series.every((s) => s.data.length === 0)).toBe(true)
    t.layer.dispose()
  })

  it('cleans up completely on dispose, and ignores settings after it', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    t.layer.dispose()
    expect(t.panes).toHaveLength(1)
    const created = vi.fn()
    indicators.setMacd({ on: false })
    indicators.setMacd({ on: true })
    created()
    expect(t.panes).toHaveLength(1)
  })
})

// What the pane looks like, as drawn: a recording canvas stands in for the real one.
function paint(series: FakeSeries, width = 500, height = 300) {
  const rects: { style: string; x: number; y: number; w: number; h: number }[] = []
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ style: this.fillStyle, x, y, w, h })
    },
  }
  for (const prim of series.primitives)
    prim
      .paneViews()[0]
      .renderer()
      .draw({
        useMediaCoordinateSpace: (cb: (s: unknown) => void) => cb({ context: ctx, mediaSize: { width, height } }),
      })
  return rects
}
const alpha = (style: string) => Number(/,([\d.]+)\)$/.exec(style)![1])

describe('how the oscillator panes read', () => {
  it('draws lines two pixels wide, and the second line of each dashed so the pair differ in style, not only shade', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    const [, macdLine, signal] = t.panes[1].series
    const [k, d] = t.panes[2].series
    for (const s of [macdLine, signal, k, d]) expect(s.options.lineWidth).toBe(2)
    expect(macdLine.options.lineStyle).toBe(0)
    expect(signal.options.lineStyle).toBe(2)
    expect(k.options.lineStyle).toBe(0)
    expect(d.options.lineStyle).toBe(2)
    // both are ink at full strength: nothing fades into the page
    expect(macdLine.options.color).toBe(palette.fg)
    expect(d.options.color).toBe(palette.fg)
    t.layer.dispose()
  })

  it('lets the data fill each pane instead of leaving the library margins around it', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    indicators.setStoch({ on: true })
    expect(t.panes[1].series[1].scale).toMatchObject({ scaleMargins: { top: 0.1, bottom: 0.1 } })
    expect(t.panes[2].series[0].scale).toMatchObject({ scaleMargins: { top: 0.1, bottom: 0.1 } })
    t.layer.dispose()
  })

  it('tints the stochastic pane and shades the zones above 80 and below 20, with a faint middle line', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    const k = t.panes[1].series[0]
    expect(k.primitives).toHaveLength(1)
    const [tint, over, under, mid] = paint(k)
    expect(tint).toMatchObject({ x: 0, y: 0, w: 500, h: 300 })
    // price 80 is y 120 and 100 is y 100; 20 is y 180 and 0 is y 200 on the fake scale
    expect(over).toMatchObject({ y: 100, h: 20 })
    expect(under).toMatchObject({ y: 180, h: 20 })
    expect(mid).toMatchObject({ y: 150, h: 1 })
    // the zones are darker than the pane
    expect(alpha(over.style)).toBeGreaterThan(alpha(tint.style))
    expect(alpha(under.style)).toBe(alpha(over.style))
    t.layer.dispose()
  })

  it('tints the MACD pane and draws a solid zero line to read the histogram against', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    const line = t.panes[1].series[1]
    const [tint, zero] = paint(line)
    expect(tint).toMatchObject({ x: 0, y: 0, w: 500, h: 300 })
    expect(zero).toMatchObject({ y: 200, h: 1, w: 500 })
    expect(alpha(zero.style)).toBeGreaterThanOrEqual(0.5)
    t.layer.dispose()
  })

  it('leaves the zero line out when it has scrolled off the pane', () => {
    const t = setup()
    indicators.setMacd({ on: true })
    const line = t.panes[1].series[1]
    line.priceToCoordinate = () => 999
    expect(paint(line)).toHaveLength(1) // only the tint
    t.layer.dispose()
  })

  it('strengthens the 20 and 80 lines and labels them on the axis', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    const bands = t.panes[1].series[0].lines
    expect(bands.map((b) => b.axis)).toEqual([true, true])
    for (const b of bands) expect(alpha(b.color)).toBeGreaterThanOrEqual(0.5)
    t.layer.dispose()
  })

  it('takes the backdrop away with the pane, and on dispose', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    const k = t.panes[1].series[0]
    expect(k.primitives).toHaveLength(1)
    indicators.setStoch({ on: false })
    expect(k.primitives).toHaveLength(0)
    indicators.setMacd({ on: true })
    const line = t.panes[1].series[1]
    t.layer.dispose()
    expect(line.primitives).toHaveLength(0)
  })

  it('keeps the backdrop on the new theme', () => {
    const t = setup()
    indicators.setStoch({ on: true })
    t.layer.refresh({ ...palette, fg: 'rgba(9,9,9,1)' } as Palette)
    const [tint] = paint(t.panes[1].series[0])
    expect(tint.style).toMatch(/^rgba\(9,9,9/)
    t.layer.dispose()
  })
})
