import type { Evaluation } from '@/lib/strategies'
import { fmtPrice } from '@/lib/format'
import { cn } from '@/lib/utils'

// The strategy's checklist over the chart, in the bias readout's language: a square per rule, filled green when it
// is met and a hairline outline when it is not, the detail beside it. When every rule is met the header says so and
// the plan's levels follow; the chart itself stays clickable beneath.

export function StrategyReadout({ evaluation }: { evaluation: Evaluation }) {
  const { strategy, results, met, ready, plan, side, pending } = evaluation
  return (
    <section
      aria-label={strategy.name}
      className={cn(
        'pointer-events-none absolute top-11 right-20 z-10 w-64 border bg-background/90 px-2.5 py-2 num text-[11px] sm:top-8',
        ready ? 'border-up' : 'border-border',
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="truncate font-medium tracking-wide uppercase">{strategy.name}</span>
        <span className={cn('ml-auto shrink-0', ready ? 'text-up' : 'text-muted-foreground')}>
          {ready ? 'Ready' : pending.length ? 'Loading' : `${met} of ${results.length}`}
        </span>
      </div>
      {pending.length > 0 && <p className="mt-0.5 text-muted-foreground">Loading {pending.join(', ')} candles</p>}
      {plan && !pending.length && (
        <p className="mt-0.5 text-muted-foreground">
          {plan.side === 'bull' ? 'Long' : 'Short'} <span className="text-foreground">{fmtPrice(plan.entry)}</span> ·
          stop <span className="text-foreground">{fmtPrice(plan.stop)}</span> · target{' '}
          <span className="text-foreground">{fmtPrice(plan.target)}</span>
        </p>
      )}
      {!plan && !side && !pending.length && <p className="mt-0.5 text-muted-foreground">Waiting for a bias</p>}
      {/* on a phone the chart is short; the verdict and the plan are what matter there */}
      <ul className="mt-1.5 hidden flex-col gap-0.5 border-t border-hairline pt-1.5 sm:flex">
        {results.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <i
              aria-hidden
              className={cn('size-2 shrink-0', r.met ? 'bg-up' : 'shadow-[inset_0_0_0_1px_var(--border)]')}
            />
            <span className={r.met ? 'text-foreground' : 'text-muted-foreground'}>{r.label}</span>
            <span className="ml-auto min-w-0 truncate text-muted-foreground" title={r.detail}>
              {r.detail}
            </span>
            <span className="sr-only">{r.met ? 'met' : 'not met'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
