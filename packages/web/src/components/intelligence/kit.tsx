import type { Freshness, SignalState } from '@/lib/intelligence/types'
import { cn } from '@/lib/utils'

// The small pieces the Market Intelligence page shares. Meaning is always in the words: the squares only echo it,
// so nothing depends on telling green from red.

export const STATE_WORD: Record<SignalState, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  mixed: 'Mixed',
  neutral: 'Neutral',
  unavailable: 'Unavailable',
}

/** A state as a square and its word. Direction takes the up/down hue; everything else is ink. */
export function StateTag({ state, className }: { state: SignalState; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 num text-xs', className)}>
      <i
        aria-hidden
        className={cn(
          'size-2 shrink-0',
          state === 'bullish' && 'bg-up',
          state === 'bearish' && 'bg-down',
          state !== 'bullish' && state !== 'bearish' && 'shadow-[inset_0_0_0_1px_var(--muted-foreground)]',
        )}
      />
      <span className={state === 'unavailable' ? 'text-muted-foreground' : undefined}>{STATE_WORD[state]}</span>
    </span>
  )
}

/** Three squares for a scenario's rank: filled count is the rank, hollow the rest. The word beside it says it too. */
export function Meter({ filled, className }: { filled: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 gap-0.5', className)}>
      {[0, 1, 2].map((i) => (
        <i
          key={i}
          className={cn('size-2', i < filled ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--muted-foreground)]')}
        />
      ))}
    </span>
  )
}

export const FRESHNESS_WORD: Record<Freshness, string> = {
  fresh: 'Fresh',
  delayed: 'Delayed',
  stale: 'Stale',
  unavailable: 'Unavailable',
}

/** "12s ago", "3m ago"; a dash when nothing has arrived. */
export function ago(now: number, at: number | null) {
  if (at === null) return '–'
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`
}

/** A section: a heading, an optional line under it, and the content. Hairline above, no card around. */
export function Section({
  title,
  note,
  aside,
  children,
  className,
}: {
  title: string
  note?: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={cn('flex flex-col gap-3 border-t border-border pt-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-medium tracking-tight">{title}</h2>
        {aside}
      </div>
      {note && <p className="max-w-prose text-xs text-pretty text-muted-foreground">{note}</p>}
      {children}
    </section>
  )
}
