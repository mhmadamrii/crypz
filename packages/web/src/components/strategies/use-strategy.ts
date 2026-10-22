import { useMemo } from 'react'
import type { Bar, Candle } from '@crypz/exchanges'
import { evaluate, strategyById, type Evaluation } from '@/lib/strategies'

/** The chosen strategy's checklist on the candles revealed so far; null when none is chosen. */
export function useStrategy(
  id: string | undefined,
  candles: Candle[],
  barLabel: Bar,
  higher: { bar: Bar; candles: Candle[] } | null,
) {
  return useMemo<Evaluation | null>(() => {
    const strategy = strategyById(id)
    return strategy ? evaluate(strategy, { candles, barLabel, higher }) : null
  }, [id, candles, barLabel, higher])
}
