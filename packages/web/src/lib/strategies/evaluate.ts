import type { Bar } from '@crypz/exchanges'
import type { Evaluation, Input, Strategy } from './types'

/**
 * Run a strategy's checklist on what the replay has revealed. `pending` lists the frames still loading, which the
 * readout says so rather than judging on candles that stop short of the clock.
 */
export function evaluate(strategy: Strategy, input: Input, pending: Bar[] = []): Evaluation | null {
  if (!input.candles.length) return null
  const { side, results } = strategy.run(input)
  const met = results.filter((r) => r.met).length
  return {
    strategy,
    side,
    results,
    met,
    ready: met === results.length && !pending.length,
    plan: results.find((r) => r.plan)?.plan ?? null,
    pending,
  }
}
