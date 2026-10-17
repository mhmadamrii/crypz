import { ChartSpline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SESSIONS, localHours, type SessionId } from '@/lib/indicators/sessions'
import { BIAS_FRAMES, FVG_SIZES, SWING_LENGTHS, activeCount, indicators, useIndicators } from '@/lib/indicators/store'
import { BAR_MS } from '@crypz/exchanges'
import { Segmented } from '@/components/workspace/kit'
import { cn } from '@/lib/utils'
import { SESSION_MAX_BAR } from './sessions-layer'

// The chart's indicator menu. Each indicator is one row with a square switch (filled = on, hollow = off, the same
// language as the exchange status squares); its options sit indented under it. More indicators join this list.

const TINT: Record<SessionId, string> = {
  asia: 'var(--session-asia)',
  london: 'var(--session-london)',
  newYork: 'var(--session-ny)',
}

function Switch({
  on,
  onToggle,
  label,
  tint = 'var(--foreground)',
  children,
}: {
  on: boolean
  onToggle: () => void
  label: string
  /** The square's colour: ink, or the hue the indicator draws in, so the menu doubles as its legend. */
  tint?: string
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
        className="size-2.5 shrink-0"
        style={on ? { backgroundColor: tint } : { boxShadow: `inset 0 0 0 1px ${tint}` }}
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
      <PopoverContent align="start" className="max-h-[80svh] w-80 overflow-y-auto p-1">
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
              tint={TINT[x.id]}
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
        <div className="mt-1 border-t border-hairline pt-1">
          <Switch on={s.fvg.on} onToggle={() => indicators.setFvg({ on: !s.fvg.on })} label="Fair value gaps">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Fair value gaps</span>
              <span className="text-xs text-pretty text-muted-foreground">
                Price ranges a three-candle move skipped, open until price trades back through them.
              </span>
            </span>
          </Switch>
          <div className={cn('flex flex-col gap-1 pb-2 pl-5', !s.fvg.on && 'opacity-50')}>
            <div className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="text-sm">Min size</span>
              <Segmented
                label="Minimum gap size, in ATR"
                options={FVG_SIZES}
                value={s.fvg.minAtr}
                onChange={(minAtr) => indicators.setFvg({ minAtr, on: true })}
                format={(v) => (v ? `${v} ATR` : 'Any')}
                size="strip"
              />
            </div>
            <Switch
              on={s.fvg.showFilled}
              onToggle={() => indicators.setFvg({ showFilled: !s.fvg.showFilled, on: true })}
              label="Show filled gaps"
            >
              <span className="text-sm">Show filled gaps</span>
            </Switch>
          </div>
        </div>
        <div className="mt-1 border-t border-hairline pt-1">
          <Switch
            on={s.structure.on}
            onToggle={() => indicators.setStructure({ on: !s.structure.on })}
            label="Market structure"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Market structure</span>
              <span className="text-xs text-pretty text-muted-foreground">
                Swing highs and lows, with each break of structure (BOS) and change of character (CHoCH) on a close.
              </span>
            </span>
          </Switch>
          <div className={cn('flex flex-col gap-1 pb-2 pl-5', !s.structure.on && 'opacity-50')}>
            <div className="flex items-center justify-between gap-3 px-3 py-1">
              <span
                className="text-sm"
                title="Bars on each side of a swing. Longer swings are fewer and confirm later."
              >
                Swing length
              </span>
              <Segmented
                label="Swing length, bars each side"
                options={SWING_LENGTHS}
                value={s.structure.length}
                onChange={(length) => indicators.setStructure({ length, on: true })}
                format={(v) => `${v} bars`}
                size="strip"
              />
            </div>
            <Switch
              on={s.structure.labels}
              onToggle={() => indicators.setStructure({ labels: !s.structure.labels, on: true })}
              label="Swing labels"
            >
              <span className="text-sm">Swing labels (HH, HL, LH, LL)</span>
            </Switch>
          </div>
        </div>
        <div className="mt-1 border-t border-hairline pt-1">
          <Switch on={s.bias.on} onToggle={() => indicators.setBias({ on: !s.bias.on })} label="Bias">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">Bias</span>
              <span className="text-xs text-pretty text-muted-foreground">
                Which way structure leans, top-down, with the price that would prove it wrong drawn on the chart.
              </span>
            </span>
          </Switch>
          <div className={cn('flex flex-col gap-1 pb-2 pl-5', !s.bias.on && 'opacity-50')}>
            <div className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="text-sm">Read from</span>
              <Segmented
                label="Higher timeframe for the bias"
                options={BIAS_FRAMES}
                value={s.bias.higher}
                onChange={(higher) => indicators.setBias({ higher, on: true })}
                size="strip"
              />
            </div>
            <p className="px-3 text-xs text-pretty text-muted-foreground">
              {BAR_MS[s.bias.higher] > barMs
                ? `Bias from ${s.bias.higher} structure, timed on the chart. Swing length follows Market structure.`
                : `${s.bias.higher} is not above this chart, so the bias reads the chart’s own structure.`}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
