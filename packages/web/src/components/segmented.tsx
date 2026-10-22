import { cn } from '@/lib/utils'

/** A joined toggle row (intervals, groupings, ranges). The pressed option inverts, like every pressed toggle. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = String,
  size = 'header',
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  format?: (v: T) => string
  /** header: in a widget's 28px header; strip: in a body's control strip. */
  size?: 'header' | 'strip'
}) {
  return (
    <div className="flex" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn(
            'px-1.5 num text-[11px] text-muted-foreground hover:text-foreground',
            size === 'header' ? 'h-6' : 'h-5',
            o === value && 'bg-foreground text-background hover:text-background',
          )}
        >
          {format(o)}
        </button>
      ))}
    </div>
  )
}
