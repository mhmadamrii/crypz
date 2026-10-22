import { useMemo } from 'react'
import type { Bar, Candle } from '@crypz/exchanges'
import { evaluate, strategyById, type Evaluation, type Series } from '@/lib/strategies'

/**
 * The chosen strategy's checklist on what the replay has revealed: the chart's candles, plus the closed candles of
 * the timeframes the strategy reads. `pending` lists the ones still loading. Null when no strategy is chosen.
 */
export function useStrategy(id: string | undefined, candles: Candle[], barLabel: Bar, series: Series, pending: Bar[]) {
  const waiting = pending.join(',')
  return useMemo<Evaluation | null>(() => {
    const strategy = strategyById(id)
    return strategy
      ? evaluate(strategy, { candles, barLabel, series }, waiting ? (waiting.split(',') as Bar[]) : [])
      : null
  }, [id, candles, barLabel, series, waiting])
}
