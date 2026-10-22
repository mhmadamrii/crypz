import { useMemo } from 'react'
import type { Bar, Candle } from '@crypz/exchanges'
import { computeBias, type Bias } from '@/lib/indicators/bias'
import { useIndicators } from '@/lib/indicators/store'

/**
 * The top-down bias as plain data from the candles on the chart (plus the closed candles of its higher timeframe,
 * when one is set above the chart's). The readout renders it; the bias layer draws its invalidation. Null when off.
 */
export function useBias(candles: Candle[], barLabel: Bar, higher: { bar: Bar; candles: Candle[] } | null) {
  const ind = useIndicators()
  return useMemo<Bias | null>(
    () =>
      ind.bias.on && candles.length
        ? computeBias({
            chart: candles,
            chartLabel: barLabel,
            higher: higher?.candles ?? null,
            higherLabel: higher?.bar ?? null,
            length: ind.structure.length,
          })
        : null,
    [ind.bias.on, ind.structure.length, candles, barLabel, higher],
  )
}
