import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_INPUT,
  MAX_TRADES,
  calculate,
  recovery,
  validate,
  type RiskInput,
  type RiskResult,
} from '@/lib/calc/risk'
import { searchText } from '@/lib/search'
import { cn } from '@/lib/utils'
import { tone } from '@/lib/format'
import { Field, NumberInput, Stat, fmt, parse } from './kit'

export type Draft = Record<keyof RiskInput, string>

const toDraft = (i: RiskInput): Draft => ({
  winRate: String(i.winRate),
  rr: String(i.rr),
  riskPct: String(i.riskPct),
  trades: String(i.trades),
  drawdownLimit: String(i.drawdownLimit),
})

export const DEFAULT_DRAFT = toDraft(DEFAULT_INPUT)

/** Turn untrusted URL search params into a partial draft (unknown keys dropped). */
export function parseDraft(search: Record<string, unknown>): Partial<Draft> {
  const out: Partial<Draft> = {}
  for (const k of ['winRate', 'rr', 'riskPct', 'trades', 'drawdownLimit'] as const) {
    const v = searchText(search[k])
    if (v !== undefined) out[k] = v.slice(0, 32)
  }
  return out
}

const toInput = (d: Draft): RiskInput => ({
  winRate: parse(d.winRate),
  rr: parse(d.rr),
  riskPct: parse(d.riskPct),
  trades: parse(d.trades),
  drawdownLimit: parse(d.drawdownLimit),
})

/** Odds as a percentage that never rounds a near-certainty up to 100% or a long shot down to 0%. */
const fmtOdds = (p: number) =>
  p >= 0.9995 ? '>99.9%' : p < 0.0005 ? '<0.1%' : `${(p * 100).toFixed(p < 0.1 || p >= 0.995 ? 1 : 0)}%`
const fmtR = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), 2)}R`
const fmtTimes = (n: number) => `×${n >= 100 ? fmt(n, 0) : fmt(n, 2)}`

/** Controlled: the route owns the draft (kept in the URL, so a plan is shareable and survives reloads). */
export function RiskCalculator({
  draft,
  onChange: set,
  onReset,
}: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onReset: () => void
}) {
  const input = useMemo(() => toInput(draft), [draft])
  const errors = useMemo(() => validate(input), [input])
  const result = useMemo(() => calculate(input), [input])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-labelledby="plan-title" className="flex flex-col gap-6 border border-border p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 id="plan-title" className="text-lg font-medium tracking-tight">
            Trading plan
          </h2>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw /> Reset
          </Button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="winRate"
            label="Win rate"
            suffix="%"
            hint="Share of trades that reach the target."
            error={errors.winRate}
          >
            <NumberInput
              id="winRate"
              value={draft.winRate}
              onChange={(v) => set({ winRate: v })}
              invalid={!!errors.winRate}
              className="pr-8"
            />
          </Field>
          <Field id="rr" label="Risk : reward" hint="What a winner pays, per 1 risked." error={errors.rr}>
            <div className="flex items-center">
              <span className="grid h-11 shrink-0 place-items-center border border-r-0 border-input px-3 num text-sm whitespace-nowrap text-muted-foreground">
                1 :
              </span>
              <NumberInput id="rr" value={draft.rr} onChange={(v) => set({ rr: v })} invalid={!!errors.rr} />
            </div>
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="riskPct"
            label="Risk per trade"
            suffix="%"
            hint="Of the equity at the time of the trade."
            error={errors.riskPct}
          >
            <NumberInput
              id="riskPct"
              value={draft.riskPct}
              onChange={(v) => set({ riskPct: v })}
              invalid={!!errors.riskPct}
              className="pr-8"
            />
          </Field>
          <Field
            id="trades"
            label="Number of trades"
            hint={`The run to judge, up to ${MAX_TRADES}.`}
            error={errors.trades}
          >
            <NumberInput
              id="trades"
              value={draft.trades}
              onChange={(v) => set({ trades: v })}
              invalid={!!errors.trades}
            />
          </Field>
        </div>

        <Field
          id="drawdownLimit"
          label="Drawdown to watch"
          suffix="%"
          hint="The fall from a peak you could not stomach. The result shows how likely it is."
          error={errors.drawdownLimit}
        >
          <NumberInput
            id="drawdownLimit"
            value={draft.drawdownLimit}
            onChange={(v) => set({ drawdownLimit: v })}
            invalid={!!errors.drawdownLimit}
            className="pr-8"
          />
        </Field>
      </section>

      <Results input={input} result={result} />
    </div>
  )
}

function verdict(input: RiskInput, r: RiskResult) {
  if (r.expectancy <= 0)
    return `Negative edge: at 1:${fmt(input.rr, 2)} you need to win more than ${fmt(r.breakeven, 1)}%, and ${fmt(input.winRate, 1)}% will lose money over time.`
  const margin = input.winRate - r.breakeven
  return margin < 5
    ? `Thin edge: ${fmt(margin, 1)} points above the ${fmt(r.breakeven, 1)}% breakeven, so costs or a slightly worse win rate erase it.`
    : `${fmt(margin, 1)} points above the ${fmt(r.breakeven, 1)}% breakeven: positive expectancy if the win rate holds.`
}

function Results({ input, result: r }: { input: RiskInput; result: RiskResult | null }) {
  return (
    <section aria-labelledby="risk-results-title" aria-live="polite" className="flex flex-col border border-border">
      <div className="border-b border-border px-5 py-4 sm:px-7">
        <h2 id="risk-results-title" className="text-lg font-medium tracking-tight">
          Result
        </h2>
      </div>

      {!r ? (
        <p className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
          Fix the highlighted fields to see the risk.
        </p>
      ) : (
        <>
          <div className="grid gap-6 border-b border-hairline px-5 py-6 sm:px-7">
            <dl className="grid grid-cols-2 gap-6">
              <Stat
                label="Expectancy per trade"
                value={fmtR(r.expectancy)}
                className={tone(r.expectancy)}
                sub={`${fmt(r.growth, 2)}% growth per trade, compounded`}
                large
              />
              <Stat label="Breakeven win rate" value={`${fmt(r.breakeven, 1)}%`} sub={`at 1:${fmt(input.rr, 2)}`} />
            </dl>
            <p className="flex items-start gap-2.5 text-sm">
              <i
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0',
                  r.expectancy > 0 ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]',
                )}
              />
              {verdict(input, r)}
            </p>
          </div>

          <div className="border-b border-hairline px-5 py-6 sm:px-7">
            <h3 className="label">Losing streaks in {fmt(input.trades, 0)} trades</h3>
            <table className="mt-3 w-full num text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 font-normal">
                    In a row
                  </th>
                  <th scope="col" className="py-1.5 font-normal">
                    Chance it happens
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    Equity falls · to recover
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.streaks.map((s) => (
                  <tr key={s.length} className="border-t border-hairline">
                    <th scope="row" className="py-2 text-left font-normal">
                      {s.length} losses
                    </th>
                    <td className="py-2">{fmtOdds(s.odds)}</td>
                    <td className="py-2 text-right">
                      <span className="text-down">−{fmt(s.drawdown, 1)}%</span>
                      <span className="text-muted-foreground"> · +{fmt(recovery(s.drawdown), 1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-6 sm:px-7">
            <h3 className="label">
              Simulated {fmt(input.trades, 0)} trades · {fmt(r.simulation.runs, 0)} runs
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-6">
              <Stat label="Runs that end in profit" value={fmtOdds(r.simulation.profitable)} />
              <Stat
                label={`Chance of a ${fmt(input.drawdownLimit, 0)}% drawdown`}
                value={fmtOdds(r.simulation.hitLimit)}
                sub="from an equity peak, at some point"
              />
              <Stat
                label="Typical result"
                value={fmtTimes(r.simulation.final.median)}
                sub={`Bad run ${fmtTimes(r.simulation.final.low)} · good run ${fmtTimes(r.simulation.final.high)}`}
              />
              <Stat
                label="Typical worst drawdown"
                value={`−${fmt(r.simulation.drawdown.median, 1)}%`}
                className="text-down"
                sub={`1 run in 20 is worse than −${fmt(r.simulation.drawdown.bad, 1)}%`}
              />
            </dl>
          </div>
          <p className="mt-auto border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">
            Assumes a fixed win rate, independent trades and equal risk on every trade. Fees, slippage and funding are
            not included. The simulation reuses one seed, so the same plan always shows the same numbers; bad run and
            good run are the 5th and 95th percentile.
          </p>
        </>
      )}
    </section>
  )
}
