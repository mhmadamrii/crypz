import { useState } from 'react'
import type { Bucket } from '@crypz/exchanges'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fmtPct, fmtSigned, tone } from '@/lib/format'

type Props = {
  buckets: Bucket[]
  focus: string | null
  onFocus?: (key: string | null) => void
  /** Show only the N rows with the largest absolute impact until expanded. */
  limit?: number
  /** First column header. */
  name?: string
}

// Phones: label row on top, the bar gets its own full-width line. sm+: one row, bar in the middle.
const ROW =
  'grid grid-cols-[minmax(0,1fr)_5rem_3rem_2.5rem] gap-x-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_3rem_2.5rem]'

/** Diverging bars around zero: right = net profit, left = net loss. Rows toggle corridor focus. */
export function EdgeBars({ buckets, focus, onFocus, limit, name = 'Asset' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const cut = !expanded && limit && buckets.length > limit
  const keep = cut
    ? new Set(
        [...buckets]
          .sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized))
          .slice(0, limit)
          .map((b) => b.key),
      )
    : null
  const rows = keep ? buckets.filter((b) => keep.has(b.key) || b.key === focus) : buckets
  const max = Math.max(...buckets.map((b) => Math.abs(b.realized)), 1e-9)
  const Row = onFocus ? 'button' : 'div'

  return (
    <div className="flex flex-col">
      <div className={cn(ROW, 'border-b border-hairline pb-2 label')}>
        <span>{name}</span>
        <span className="hidden text-center sm:block">Net</span>
        <span className="text-right">USDT</span>
        <span className="text-right">Win</span>
        <span className="text-right">N</span>
      </div>
      {rows.map((b) => {
        const w = (Math.abs(b.realized) / max) * 50
        const active = focus === b.key
        return (
          <Row
            key={b.key}
            {...(onFocus
              ? { type: 'button' as const, 'aria-pressed': active, onClick: () => onFocus(active ? null : b.key) }
              : {})}
            className={cn(
              ROW,
              'items-center gap-y-2 border-b border-hairline py-2 text-left text-sm transition-opacity duration-300',
              onFocus && 'hover:bg-accent/60',
              focus && !active && 'opacity-35',
              active && 'bg-accent',
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <i className={cn('size-1.5 shrink-0', active ? 'bg-foreground' : 'bg-transparent')} />
              {b.label}
            </span>
            <span className="relative order-last col-span-full h-2 sm:order-none sm:col-span-1">
              <i className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
              <i
                className="absolute inset-y-0 bg-foreground"
                style={
                  b.realized >= 0
                    ? { left: '50%', width: `${w}%` }
                    : {
                        right: '50%',
                        width: `${w}%`,
                        background: 'transparent',
                        boxShadow: 'inset 0 0 0 1px var(--foreground)',
                      }
                }
              />
            </span>
            <span className={cn('text-right num', tone(b.realized))}>{fmtSigned(b.realized)}</span>
            <span className="text-right num text-muted-foreground">{fmtPct(b.winRate, 0)}</span>
            <span className="text-right num text-muted-foreground">{b.count}</span>
          </Row>
        )
      })}
      {limit && buckets.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 self-start text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? `Show top ${limit} by impact` : `Show all ${buckets.length} assets`}
        </Button>
      )}
    </div>
  )
}
