import type { Bar, Candle } from '@crypz/exchanges'
import { computeBias } from '@/lib/indicators/bias'
import { atr } from '@/lib/indicators/fvg'
import { findLiquidity } from '@/lib/indicators/liquidity'
import { findZones } from '@/lib/indicators/order-blocks'
import { marketStructure } from '@/lib/indicators/structure'
import type { Ctx, Evaluation, Strategy } from './types'

/**
 * Run a strategy's checklist on the candles revealed so far. `higher` is the closed candles of the strategy's bias
 * timeframe, when one sits above the chart's; without it the bias reads the chart's own structure.
 */
export function evaluate(
  strategy: Strategy,
  input: { candles: Candle[]; barLabel: Bar; higher: { bar: Bar; candles: Candle[] } | null },
): Evaluation | null {
  const { candles, higher } = input
  if (!candles.length) return null
  const { params } = strategy
  const bias = computeBias({
    chart: candles,
    chartLabel: input.barLabel,
    higher: higher?.candles ?? null,
    higherLabel: higher?.bar ?? null,
    length: params.swing,
  })
  const ctx: Ctx = {
    params,
    candles,
    side: bias.side,
    bias,
    biasLabel: higher?.bar ?? input.barLabel,
    structure: marketStructure(candles, params.swing),
    zones: findZones(candles, { strength: params.impulse, imbalance: true, withTrend: false, swing: params.swing }),
    liquidity: findLiquidity(candles, { tolerance: params.tolerance, swing: params.swing }),
    atr: atr(candles).at(-1) ?? Number.NaN,
  }
  const results = strategy.rules.map((r) => ({ id: r.id, label: r.label, ...r.check(ctx) }))
  const met = results.filter((r) => r.met).length
  return {
    strategy,
    side: bias.side,
    results,
    met,
    ready: met === results.length,
    plan: results.find((r) => r.plan)?.plan ?? null,
  }
}
