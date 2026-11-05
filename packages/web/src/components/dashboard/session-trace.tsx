import { useMemo, useState } from 'react'
import type { Position } from '@crypz/exchanges'
import { cn } from '@/lib/utils'
import { fmtSigned, startOfDay, tone } from '@/lib/format'

type Session = {
  day: number
  positions: Position[]
  net: number
  wins: number
  elevatedLeverage: boolean
}

type Props = {
  /** Oldest first. */
  positions: Position[]
  focus: string | null
  className?: string
}

/** A session run meaningfully hotter than this product's typical ~10x isolated swaps. */
const ELEVATED_LEVERAGE = 20

const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

function groupSessions(positions: Position[]): Session[] {
  const map = new Map<number, Position[]>()
  for (const p of positions) {
    const day = startOfDay(p.closedAt)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(p)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, ps]) => ({
      day,
      positions: ps,
      net: ps.reduce((s, p) => s + p.realizedPnl, 0),
      wins: ps.filter((p) => p.realizedPnl > 0).length,
      elevatedLeverage: ps.some((p) => p.leverage >= ELEVATED_LEVERAGE),
    }))
}

/**
 * The pit-wall signature: one bar per trading session (calendar day), height by the session's net
 * result. Violet marks the personal-best session in range; amber marks a session run at elevated leverage.
 */
export function SessionTrace({ positions, focus, className }: Props) {
  const [hover, setHover] = useState<Session | null>(null)

  const sessions = useMemo(() => groupSessions(positions), [positions])
  const scale = useMemo(() => {
    const mags = sessions.map((s) => Math.abs(s.net)).sort((a, b) => a - b)
    return mags[Math.floor(mags.length * 0.9)] || 1
  }, [sessions])
  const best = useMemo(
    () => sessions.reduce<Session | null>((b, s) => (s.net > 0 && (!b || s.net > b.net) ? s : b), null),
    [sessions],
  )

  const shown = hover ?? sessions[sessions.length - 1] ?? null
  const inFocus = (s: Session) => !focus || s.positions.some((p) => p.base === focus)

  return (
    <div className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div
        role="group"
        aria-label={`${sessions.length} trading sessions, oldest first`}
        className="flex min-h-40 min-w-0 flex-1 items-end gap-px sm:gap-[3px]"
        onMouseLeave={() => setHover(null)}
      >
        {sessions.length ? (
          sessions.map((s, i) => {
            const height = 10 + 90 * Math.min(1, Math.abs(s.net) / scale)
            const isBest = best?.day === s.day
            const dimmed = !inFocus(s)
            return (
              <button
                key={s.day}
                type="button"
                onMouseEnter={() => setHover(s)}
                onFocus={() => setHover(s)}
                aria-label={`${fmtDay(s.day)}: ${s.positions.length} trades, ${fmtSigned(s.net)} USDT${isBest ? ', personal best' : ''}${s.elevatedLeverage ? ', elevated leverage' : ''}`}
                className={cn(
                  'cell-in group relative min-w-px flex-1 rounded-t-sm transition-opacity duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  dimmed && 'opacity-20',
                )}
                style={{ height: `${height}%`, animationDelay: `${Math.min(i * 10, 900)}ms` }}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-t-sm transition-colors',
                    isBest
                      ? 'bg-accent-best'
                      : s.net >= 0
                        ? 'bg-up/70 group-hover:bg-up'
                        : 'bg-down/70 group-hover:bg-down',
                  )}
                />
                {s.elevatedLeverage && (
                  <span
                    aria-hidden
                    className="absolute -top-2 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent-risk"
                  />
                )}
              </button>
            )
          })
        ) : (
          <span className="flex h-full items-center text-sm text-muted-foreground">
            No closed sessions in this range.
          </span>
        )}
      </div>

      <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-card px-4 py-3 text-sm">
        {shown ? (
          <>
            <span className="num font-medium">{fmtDay(shown.day)}</span>
            <span className="text-muted-foreground">
              {shown.positions.length} trade{shown.positions.length === 1 ? '' : 's'} · {shown.wins}W ·{' '}
              {shown.positions.length - shown.wins}L
            </span>
            {best?.day === shown.day && (
              <span className="rounded-full bg-accent-best/15 px-2 py-0.5 text-xs font-medium text-accent-best">
                Personal best
              </span>
            )}
            {shown.elevatedLeverage && (
              <span className="rounded-full bg-accent-risk/15 px-2 py-0.5 text-xs font-medium text-accent-risk">
                Elevated leverage
              </span>
            )}
            <span className={cn('ml-auto num font-medium', tone(shown.net))}>{fmtSigned(shown.net)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">No closed sessions in this range.</span>
        )}
      </div>
    </div>
  )
}

export function SessionTraceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-sm bg-up/70" /> Win session
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-sm bg-down/70" /> Loss session
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-2.5 rounded-sm bg-accent-best" /> Personal best
      </span>
      <span className="flex items-center gap-1.5">
        <i className="size-1.5 rounded-full bg-accent-risk" /> Elevated leverage
      </span>
    </div>
  )
}
