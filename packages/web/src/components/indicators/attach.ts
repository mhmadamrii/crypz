import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Candle } from '@crypz/exchanges'
import type { Bias } from '@/lib/indicators/bias'
import type { createMapper } from '@/components/drawings/layer'
import { monoFont, type Palette } from '@/components/trade/chart-kit'
import { attachBiasLayer } from './bias-layer'
import { attachFootprintLayer, type FootprintData } from './footprint-layer'
import { attachFvgLayer } from './fvg-layer'
import { attachOrderBlocksLayer } from './order-blocks-layer'
import { attachSessionsLayer } from './sessions-layer'
import { attachStructureLayer } from './structure-layer'

/**
 * Every indicator layer, stacked in draw order, for any chart that shows candles (the replay and the live trade
 * chart). Layers read the chart's current data through getters, so the caller keeps one ref and never re-attaches.
 * Call `refresh` when the candles, the bias or the footprint change without the chart moving.
 */
export function attachIndicators(opts: {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  x: ReturnType<typeof createMapper>['x']
  candles: () => Candle[]
  barMs: () => number
  bias: () => Bias | null
  /** Omit where there is no footprint history to draw. */
  footprint?: () => FootprintData | null
  palette: Palette
}) {
  const { chart, series, x, candles, barMs, bias, footprint, palette } = opts
  const font = monoFont()
  // the footprint's heat sits lowest and its cell columns replace the candles when zoomed in, so every other
  // indicator draws over it
  const footprintLayer = footprint
    ? attachFootprintLayer({ chart, series, x, data: footprint, barMs, palette, font })
    : null
  const sessions = attachSessionsLayer({ chart, series, x, candles, barMs, palette, font })
  // gaps draw over the session boxes: they are narrower and nearer to price
  const fvg = attachFvgLayer({ chart, series, x, candles, palette })
  // order blocks draw over the gaps: a zone is the base the gap was left from
  const orderBlocks = attachOrderBlocksLayer({ chart, series, x, candles, palette, font })
  // structure labels and break lines sit over the candles, under the drawings
  const structure = attachStructureLayer({ chart, series, x, candles, palette, font })
  const biasLayer = attachBiasLayer({ chart, series, x, candles, bias, palette, font })
  return {
    refresh(p?: Palette) {
      footprintLayer?.refresh(p)
      sessions.refresh(p)
      fvg.refresh(p)
      orderBlocks.refresh(p)
      structure.refresh(p)
      biasLayer.refresh(p)
    },
    footprintAt: footprintLayer?.at,
    dispose() {
      footprintLayer?.dispose()
      sessions.dispose()
      fvg.dispose()
      orderBlocks.dispose()
      structure.dispose()
      biasLayer.dispose()
    },
  }
}
