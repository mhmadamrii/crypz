import { ChartSpline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SESSIONS, localHours } from '@/lib/indicators/sessions'
import { activeCount, indicators, useIndicators } from '@/lib/indicators/store'
import { cn } from '@/lib/utils'
import { SESSION_MAX_BAR } from './sessions-layer'

// The chart's indicator menu. Each indicator is one row with a square switch (filled = on, hollow = off, the same
// language as the exchange status squares); its options sit indented under it. More indicators join this list.

function Switch({
  on,
  onToggle,
  label,
  children,
}: {
  on: boolean
  onToggle: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
    >
      <i
        aria-hidden
        className={cn('size-2.5 shrink-0', on ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]')}
      />
      {children}
    </button>
  )
}

export function IndicatorMenu({ barMs, className }: { barMs: number; className?: string }) {
  const s = useIndicators()
  const count = activeCount(s)
  const tooLong = barMs > SESSION_MAX_BAR

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Indicators"
          aria-label={`Indicators${count ? `, ${count} on` : ''}`}
          className={className}
        >
          <ChartSpline />
          <span className="hidden xl:inline">Indicators</span>
          {count > 0 && <span className="num text-[11px] text-muted-foreground">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <h3 className="px-3 pt-2 pb-1 label">Indicators</h3>
        <Switch
          on={s.sessions.on}
          onToggle={() => indicators.setSessions({ on: !s.sessions.on })}
          label="Trading sessions"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">Sessions</span>
            <span className="text-xs text-pretty text-muted-foreground">
              Asia, London and New York as boxes over each session’s high and low.
            </span>
          </span>
        </Switch>
        <div className={cn('pb-1 pl-5', !s.sessions.on && 'opacity-50')}>
          {SESSIONS.map((x) => (
            <Switch
              key={x.id}
              on={s.sessions[x.id]}
              onToggle={() => indicators.setSessions({ [x.id]: !s.sessions[x.id], on: true })}
              label={`${x.name} session`}
            >
              <span className="flex flex-1 items-baseline justify-between gap-3">
                <span className="text-sm">{x.name}</span>
                <span className="num text-[11px] text-muted-foreground" title="Today, in your time zone">
                  {localHours(x.id)}
                </span>
              </span>
            </Switch>
          ))}
          <p className={cn('px-3 pt-1 text-xs text-muted-foreground', tooLong && s.sessions.on && 'text-foreground')}>
            {tooLong && s.sessions.on
              ? 'Switch to 2H or shorter to see them; on longer bars a session is a candle or two.'
              : 'Shown on 2H bars and shorter. Hours follow each city’s daylight saving.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
