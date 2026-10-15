import type { Bucket } from '@crypz/exchanges'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { fmtPct, fmtSigned } from '@/lib/format'

/** Buckets as mosaic squares: filled = net positive, hollow = net negative, density = magnitude. */
export function CellStrip({
  buckets,
  tick = (b) => b.label,
  className,
}: {
  buckets: Bucket[]
  tick?: (b: Bucket, i: number) => string
  className?: string
}) {
  const max = Math.max(...buckets.map((b) => Math.abs(b.realized)), 1e-9)
  return (
    <div
      className={cn('grid gap-[3px]', className)}
      style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
    >
      {buckets.map((b, i) => {
        const ink = b.count ? 0.25 + 0.75 * (Math.abs(b.realized) / max) : 0
        return (
          <Tooltip key={b.key}>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="aspect-square w-full"
                  style={
                    !b.count
                      ? { boxShadow: 'inset 0 0 0 1px var(--hairline)' }
                      : b.realized >= 0
                        ? { background: `color-mix(in oklab, var(--foreground) ${ink * 100}%, transparent)` }
                        : {
                            boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--foreground) ${ink * 90}%, transparent)`,
                          }
                  }
                />
                <span className="num text-[10px] text-muted-foreground">{tick(b, i)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="num">
              {b.label} · {b.count} trades · {fmtSigned(b.realized)} USDT · {fmtPct(b.winRate, 0)} win
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
