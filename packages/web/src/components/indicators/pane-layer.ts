import type {
  IPrimitivePaneRenderer,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  Time,
} from 'lightweight-charts'
import type { Palette } from '@/components/trade/chart-kit'
import { indicators } from '@/lib/indicators/store'

// What every indicator layer shares: a series primitive that draws in media (CSS pixel) coordinates, redraws when
// the indicator settings change, and takes a new palette on a theme flip.

export type Layer = { refresh: (palette?: Palette) => void; dispose: () => void }

export function attachPaneLayer(
  series: ISeriesApi<'Candlestick'>,
  /** 'bottom' sits under the candles (zones); 'top' over them (labels). */
  zOrder: PrimitivePaneViewZOrder,
  palette: Palette,
  draw: (ctx: CanvasRenderingContext2D, p: Palette, size: { width: number; height: number }) => void,
): Layer {
  let p = palette
  let requestUpdate = () => {}
  const renderer: IPrimitivePaneRenderer = {
    draw: (target) => target.useMediaCoordinateSpace(({ context, mediaSize }) => draw(context, p, mediaSize)),
  }
  const primitive: ISeriesPrimitive<Time> = {
    attached: (param) => {
      requestUpdate = param.requestUpdate
    },
    detached: () => {
      requestUpdate = () => {}
    },
    paneViews: () => [{ zOrder: () => zOrder, renderer: () => renderer }],
  }
  series.attachPrimitive(primitive)
  const unsubscribe = indicators.subscribe(() => requestUpdate())
  return {
    refresh: (next) => {
      if (next) p = next
      requestUpdate()
    },
    dispose: () => {
      unsubscribe()
      series.detachPrimitive(primitive)
    },
  }
}
