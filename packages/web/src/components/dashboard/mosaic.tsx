import { useMemo, useState } from 'react'
import type { Position } from '@crypz/exchanges'
import { cn } from '@/lib/utils'
import { fmtDate, fmtSigned, tone } from '@/lib/format'

type Props = {
  /** Oldest first. */
  positions: Position[]
  focus: string | null
  onFocus: (base: string | null) => void
  className?: string
}

/**
 * The signature: one square per closed position, oldest top-left.
 * Filled = win, hollow = loss, ink density = size of the result.
 */
export function Mosaic({ positions, focus, onFocus, className }: Props) {
  const [hover, setHover] = useState<Position | null>(null)

  const scale = useMemo(() => {
    const mags = positions.map((p) => Math.abs(p.realizedPnl)).sort((a, b) => a - b)
    return mags[Math.floor(mags.length * 0.9)] || 1
  }, [positions])

  const shown = hover ?? positions[positions.length - 1] ?? null

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div
        role="group"
        aria-label={`${positions.length} closed positions, oldest first`}
        className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px] sm:grid-cols-[repeat(24,minmax(0,1fr))]"
        onMouseLeave={() => setHover(null)}
      >
        {positions.map((p, i) => {
          const win = p.realizedPnl > 0
          const ink = 0.28 + 0.72 * Math.min(1, Math.abs(p.realizedPnl) / scale)
          const dimmed = focus !== null && p.base !== focus
          return (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              aria-label={`${p.symbol} ${p.side} ${fmtSigned(p.realizedPnl, 4)} USDT, closed ${fmtDate(p.closedAt)}`}
              onMouseEnter={() => setHover(p)}
              onFocus={() => setHover(p)}
              onClick={() => onFocus(focus === p.base ? null : p.base)}
              className={cn(
                'cell-in aspect-square w-full transition-opacity duration-300 hover:outline hover:outline-1 hover:outline-offset-1 hover:outline-foreground',
                dimmed && 'opacity-[0.12]',
                hover?.id === p.id && 'outline outline-1 outline-offset-1 outline-foreground',
              )}
              style={{
                animationDelay: `${Math.min(i * 3, 900)}ms`,
                background: win ? `color-mix(in oklab, var(--foreground) ${ink * 100}%, transparent)` : undefined,
                boxShadow: win
                  ? undefined
                  : `inset 0 0 0 1px color-mix(in oklab, var(--foreground) ${ink * 85}%, transparent)`,
              }}
            />
          )
        })}
      </div>

      <div className="grid min-h-12 grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-t border-hairline pt-3 text-sm sm:grid-cols-[auto_auto_auto_1fr_auto]">
        {shown ? (
          <>
            <span className="num text-muted-foreground">#{positions.indexOf(shown) + 1}</span>
            <span className="font-medium">{shown.symbol}</span>
            <span className="hidden label sm:inline">
              {shown.side} · {shown.leverage}x
            </span>
            <span className="hidden num text-muted-foreground sm:inline">{fmtDate(shown.closedAt)}</span>
            <span className={cn('text-right num font-medium', tone(shown.realizedPnl))}>
              {fmtSigned(shown.realizedPnl, 4)}
            </span>
          </>
        ) : (
          <span className="col-span-full text-muted-foreground">No closed positions in this range.</span>
        )}
      </div>
    </div>
  )
}

export function MosaicLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 bg-foreground" /> Win
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 shadow-[inset_0_0_0_1px_var(--foreground)]" /> Loss
      </span>
      <span className="hidden sm:inline">Density = size of result</span>
    </div>
  )
}
