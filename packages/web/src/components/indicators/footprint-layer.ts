import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Palette } from '@/components/trade/chart-kit'
import { fmtSize } from '@/components/workspace/kit'
import {
  absorptionsOf,
  columnsAt,
  columnsOf,
  imbalancesOf,
  type Absorption,
  type Column,
  type Imbalance,
  type Minute,
} from '@/lib/footprint'
import { indicators } from '@/lib/indicators/store'
import { attachPaneLayer } from './pane-layer'

// The footprint on the replay chart, from OKX trade history the api folds per day. Two zoom states:
//  - zoomed out, each bar's rows are an ink-density heat strip behind the candle, the same density scale as the
//    workspace widget, and only the reading marks sit on top;
//  - zoomed in until a row can hold two numbers, each bar becomes the widget's cell column (sell × buy, diagonal
//    imbalance bold in its colour, point of control outlined in ink) with the candle redrawn as a thin wick and
//    body down its left edge (filled = up, hollow = down, as the chart's own candles).
// Stacked imbalance is a 2px rail on that side's edge, absorption a 1px outline round the row that held in the
// resting side's colour (bids up, asks down) and a square beside the bar. Replay-safe: only minutes closed by the
// clock are read (`columnsAt`), and absorption waits for the next bar to finish.

/** Footprint is drawn on these bars and shorter; on longer ones a bar is hundreds of rows. */
export const FOOTPRINT_MAX_BAR = 60 * 60_000
const DETAIL_BAR = 64 // px per bar before cells carry numbers
const DETAIL_ROW = 11 // px per row before cells carry numbers
/** Bar tint: the depth chart's 12%, which keeps the numbers over it readable. */
const BAR_ALPHA = 0.12

export type FootprintData = {
  /** Every minute loaded, possibly past the clock; the layer reads only what had closed by `now`. */
  minutes: Map<number, Minute>
  /** The finest row the loaded days were folded at. */
  step: number
  now: number
}

const alpha = (rgba: string, a: number) => rgba.replace(/,\s*[\d.]+\)$/, `,${a})`)

export function attachFootprintLayer(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: (time: number) => number | null
  data: () => FootprintData | null
  barMs: () => number
  palette: Palette
  font: string
}) {
  const { chart, series } = opts

  // Every column is folded once per data set, bar and row size; each clock step only trims and rebuilds the bar the
  // clock sits inside. Readings are kept per column object, so a finished bar is read once.
  let full: { minutes: Map<number, Minute>; span: number; step: number; cols: Column[] } | null = null
  let view: { cols: Column[]; now: number; absorb: number; absorbed: Map<number, Absorption> } | null = null
  const imbalances = {
    diagonal: new WeakMap<Column, Map<number, Imbalance>>(),
    row: new WeakMap<Column, Map<number, Imbalance>>(),
  }
  const NONE = new Map<number, Imbalance>()

  const read = () => {
    const s = indicators.get().footprint
    const d = opts.data()
    const span = opts.barMs()
    if (!s.on || !d || span > FOOTPRINT_MAX_BAR) return null
    const step = d.step * 10 ** s.rows
    if (full?.minutes !== d.minutes || full.span !== span || full.step !== step) {
      full = { minutes: d.minutes, span, step, cols: columnsOf(d.minutes, span, step, Infinity) }
      view = null
    }
    if (view?.now !== d.now || view.absorb !== s.absorb) {
      const cols = columnsAt(full.cols, d.minutes, span, step, d.now)
      view = {
        cols,
        now: d.now,
        absorb: s.absorb,
        absorbed: s.absorb ? absorptionsOf(cols, step, s.absorb) : new Map(),
      }
    }
    return { step, ...view }
  }
  const imbalancesFor = (col: Column) => {
    const mode = indicators.get().footprint.imbalance
    if (mode === 'off') return NONE
    let m = imbalances[mode].get(col)
    if (!m) imbalances[mode].set(col, (m = imbalancesOf(col, mode)))
    return m
  }

  /** Bars on screen with their pixel x, and whether the zoom holds numbers. */
  const layout = (cols: Column[], step: number) => {
    const spacing = chart.timeScale().options().barSpacing
    const width = chart.timeScale().width()
    const shown: { col: Column; x: number }[] = []
    for (const col of cols) {
      const x = opts.x(col.start)
      if (x !== null && x > -spacing && x < width + spacing) shown.push({ col, x })
    }
    const last = cols.at(-1)
    const a = last ? series.priceToCoordinate(last.close) : null
    const b = last ? series.priceToCoordinate(last.close + step) : null
    const rowPx = a !== null && b !== null ? Math.abs(a - b) : 0
    return { shown, spacing, detail: spacing >= DETAIL_BAR && rowPx >= DETAIL_ROW }
  }

  /** The row's top and bottom in pixels. */
  const rowBox = (k: number, step: number) => {
    const top = series.priceToCoordinate((k + 1) * step)
    const bottom = series.priceToCoordinate(k * step)
    return top === null || bottom === null ? null : { top: Math.round(top), h: Math.max(1, Math.round(bottom - top)) }
  }

  const peakOf = (shown: { col: Column }[]) => {
    let peak = 0
    for (const { col } of shown) for (const [b, s] of col.cells.values()) peak = Math.max(peak, b + s)
    return peak || 1
  }
  const density = (v: number, peak: number) => 0.04 + (v / peak) * 0.28
  /** The largest single side in any cell, the scale both bars share so their lengths compare across rows. */
  const sidePeakOf = (shown: { col: Column }[]) => {
    let peak = 0
    for (const { col } of shown) for (const [b, s] of col.cells.values()) peak = Math.max(peak, b, s)
    return peak || 1
  }

  // behind the candles: the heat strips, when zoomed out
  const heat = attachPaneLayer(series, 'bottom', opts.palette, (ctx, p) => {
    const r = read()
    if (!r) return
    const { shown, spacing, detail } = layout(r.cols, r.step)
    if (detail || spacing < 2) return
    const peak = peakOf(shown)
    const w = Math.max(1, Math.round(spacing * 0.9))
    for (const { col, x } of shown) {
      const left = Math.round(x - w / 2)
      for (const [k, [b, s]] of col.cells) {
        const box = rowBox(k, r.step)
        if (!box) continue
        ctx.fillStyle = alpha(p.fg, density(b + s, peak))
        ctx.fillRect(left, box.top, w, box.h)
      }
    }
  })

  // over the candles: the cell columns when zoomed in, and the reading marks at every zoom
  const marks = attachPaneLayer(series, 'top', opts.palette, (ctx, p) => {
    const r = read()
    if (!r) return
    const { shown, spacing, detail } = layout(r.cols, r.step)
    if (spacing < 2) return
    const peak = peakOf(shown)
    const bars = indicators.get().footprint.cells === 'bars'
    const sidePeak = bars ? sidePeakOf(shown) : 1
    const w = detail ? Math.round(spacing - 4) : Math.max(1, Math.round(spacing * 0.9))
    ctx.lineWidth = 1

    for (const { col, x } of shown) {
      const left = Math.round(x - w / 2)
      const imb = imbalancesFor(col)
      const abs = r.absorbed.get(col.start)

      if (detail) {
        // the cell column covers the chart's candle, which is redrawn thin at its left edge
        const hi = series.priceToCoordinate(col.high)
        const lo = series.priceToCoordinate(col.low)
        const keys = [...col.cells.keys()]
        const topBox = rowBox(Math.max(...keys), r.step)
        const lowBox = rowBox(Math.min(...keys), r.step)
        if (hi === null || lo === null || !topBox || !lowBox) continue
        ctx.fillStyle = p.bg
        ctx.fillRect(left, topBox.top, w, lowBox.top + lowBox.h - topBox.top)
        const mid = left + 6 + (w - 6) / 2
        ctx.textBaseline = 'middle'
        for (const [k, [b, s]] of col.cells) {
          const box = rowBox(k, r.step)
          if (!box) continue
          if (bars) {
            // sell grows left from the cell's middle, buy right, on one scale
            const half = (w - 6) / 2
            ctx.fillStyle = alpha(p.down, BAR_ALPHA)
            ctx.fillRect(Math.round(mid - (s / sidePeak) * half), box.top, Math.round((s / sidePeak) * half), box.h)
            ctx.fillStyle = alpha(p.up, BAR_ALPHA)
            ctx.fillRect(Math.round(mid), box.top, Math.round((b / sidePeak) * half), box.h)
          } else {
            ctx.fillStyle = alpha(p.fg, density(b + s, peak))
            ctx.fillRect(left + 6, box.top, w - 6, box.h)
          }
          const side = imb.get(k)?.side
          const yText = box.top + box.h / 2
          ctx.font = `${side === 'sell' ? '600 ' : ''}10px ${opts.font}`
          ctx.fillStyle = side === 'sell' ? p.down : p.fg
          ctx.textAlign = 'right'
          ctx.fillText(fmtSize(s), mid - 3, yText)
          ctx.font = `${side === 'buy' ? '600 ' : ''}10px ${opts.font}`
          ctx.fillStyle = side === 'buy' ? p.up : p.fg
          ctx.textAlign = 'left'
          ctx.fillText(fmtSize(b), mid + 3, yText)
          if (k === col.poc && abs?.row !== k) {
            ctx.strokeStyle = p.fg
            ctx.strokeRect(left + 6.5, box.top + 0.5, w - 7, box.h - 1)
          }
        }
        // thin candle: 1px wick, 3px body
        const o = series.priceToCoordinate(col.open)
        const c = series.priceToCoordinate(col.close)
        ctx.fillStyle = p.fg
        ctx.fillRect(left + 2, Math.round(hi), 1, Math.max(1, Math.round(lo - hi)))
        if (o !== null && c !== null) {
          const top = Math.round(Math.min(o, c))
          const h = Math.max(1, Math.round(Math.abs(c - o)))
          if (col.close >= col.open) ctx.fillRect(left + 1, top, 3, h)
          else {
            ctx.fillStyle = p.bg
            ctx.fillRect(left + 1, top, 3, h)
            ctx.strokeStyle = p.fg
            ctx.strokeRect(left + 1.5, top + 0.5, 2, Math.max(0, h - 1))
          }
        }
      }

      // stacked imbalance: a rail on the side's edge (sell left, buy right)
      if (spacing >= 6)
        for (const [k, m] of imb) {
          if (!m.stacked) continue
          const box = rowBox(k, r.step)
          if (!box) continue
          ctx.fillStyle = m.side === 'buy' ? p.up : p.down
          ctx.fillRect(m.side === 'buy' ? left + w - 2 : detail ? left + 6 : left, box.top, 2, box.h)
        }

      if (abs) {
        const box = rowBox(abs.row, r.step)
        if (!box) continue
        const hue = abs.side === 'bid' ? p.up : p.down
        const from = detail ? left + 6 : left
        ctx.strokeStyle = hue
        ctx.strokeRect(from + 0.5, box.top + 0.5, left + w - from - 1, Math.max(1, box.h - 1))
        ctx.fillStyle = hue
        ctx.fillRect(left + w + 3, Math.round(box.top + box.h / 2 - 2.5), 5, 5)
      }
    }
  })

  return {
    refresh: (q?: Palette) => {
      heat.refresh(q)
      marks.refresh(q)
    },
    dispose: () => {
      heat.dispose()
      marks.dispose()
    },
    /** The bar's footprint reading for the hover readout, as last drawn. */
    at: (time: number) => {
      const r = read()
      const col = r?.cols.find((c) => c.start === time)
      if (!col) return null
      const abs = r!.absorbed.get(time)
      return { buy: col.buy, sell: col.sell, absorbed: abs ? { ...abs, price: abs.row * r!.step } : null }
    },
  }
}
