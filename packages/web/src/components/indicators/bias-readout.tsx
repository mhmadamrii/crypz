import type { Bias, Side } from '@/lib/indicators/bias'
import { fmtPrice } from '@/lib/format'
import { cn } from '@/lib/utils'

// The bias, read in one glance: which way, from which timeframe, how many factors agree, and the price that
// would prove it wrong. Each factor is a row in the world's square language: filled when it agrees with the bias,
// hollow when it argues against it, a hairline outline when it has no view yet. No probability is shown; there is
// none to show until it has been measured.

const WORD: Record<Side, string> = { bull: 'Bullish', bear: 'Bearish' }

export function BiasReadout({
  bias,
  chartLabel,
  higherLabel,
}: {
  bias: Bias
  chartLabel: string
  higherLabel: string | null
}) {
  const source = bias.source === 'higher' ? higherLabel : chartLabel
  const tone = bias.side === 'bull' ? 'text-up' : bias.side === 'bear' ? 'text-down' : 'text-muted-foreground'

  return (
    <section
      aria-label="Bias"
      className="pointer-events-none absolute top-11 left-3 z-10 w-60 border border-border bg-background/90 px-2.5 py-2 num text-[11px] sm:top-8"
    >
      <div className="flex items-baseline gap-1.5">
        <span className={cn('font-medium tracking-wide uppercase', tone)}>
          {bias.side ? WORD[bias.side] : 'Neutral'}
        </span>
        <span className="text-muted-foreground">· {source}</span>
        {bias.side && (
          <span className="ml-auto text-muted-foreground">
            {bias.agree} of {bias.factors.length} agree
          </span>
        )}
      </div>
      <p className="mt-0.5 text-muted-foreground">
        {bias.side && bias.invalidation ? (
          <>
            Invalid {bias.side === 'bull' ? 'below' : 'above'}{' '}
            <span className="text-foreground">{fmtPrice(bias.invalidation.price)}</span>
          </>
        ) : bias.invalidated && !bias.side ? (
          <>
            {WORD[bias.invalidated.side]} invalidated at{' '}
            <span className="text-foreground">{fmtPrice(bias.invalidated.price)}</span>
          </>
        ) : (
          `No break of structure on ${source} yet`
        )}
      </p>
      {/* on a phone the chart is short; the verdict and its level are what matter there */}
      <ul className="mt-1.5 hidden flex-col gap-0.5 border-t border-hairline pt-1.5 sm:flex">
        {bias.factors.map((f) => {
          const agrees = !!bias.side && f.side === bias.side
          return (
            <li key={f.id} className="flex items-center gap-2">
              <i
                aria-hidden
                className={cn(
                  'size-2 shrink-0',
                  !f.side
                    ? 'shadow-[inset_0_0_0_1px_var(--border)]'
                    : agrees
                      ? 'bg-foreground'
                      : 'shadow-[inset_0_0_0_1px_var(--foreground)]',
                )}
              />
              <span className="text-muted-foreground">{f.label}</span>
              <span
                className={cn(
                  'ml-auto',
                  f.side === 'bull' ? 'text-up' : f.side === 'bear' ? 'text-down' : 'text-muted-foreground',
                )}
              >
                {f.side === 'bull' ? 'Up' : f.side === 'bear' ? 'Down' : '–'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
