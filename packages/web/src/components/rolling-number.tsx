import { cn } from '@/lib/utils'

/**
 * Fixed-cell numerals: each character sits in its own tabular cell and rolls in
 * when its value changes (keyed by value + position).
 */
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('inline-flex overflow-hidden num', className)} aria-label={value}>
      {[...value].map((ch, i) => (
        <span
          key={`${i}-${ch}-${value.length}`}
          aria-hidden
          className="digit-roll inline-block"
          style={{ animationDelay: `${i * 28}ms` }}
        >
          {ch}
        </span>
      ))}
    </span>
  )
}
