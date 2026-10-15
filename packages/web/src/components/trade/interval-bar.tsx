import { useEffect, useRef } from 'react'
import { Settings } from 'lucide-react'
import { BARS, type Bar } from '@crypz/exchanges'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useIntervals } from '@/lib/intervals'
import { cn } from '@/lib/utils'

type Props = {
  value: Bar
  onChange: (bar: Bar) => void
  className?: string
  /** Stretch the items to fill the row (phone layouts). */
  fill?: boolean
}

/** Gear + the intervals the viewer picked. The current interval always shows, even when it is not picked. */
export function IntervalBar({ value, onChange, className, fill }: Props) {
  const { selected } = useIntervals()
  const shown = BARS.filter((b) => b === value || selected.includes(b))
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <IntervalPicker />
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        onValueChange={(v) => v && onChange(v as Bar)}
        aria-label="Timeframe"
        className={cn(fill && 'flex-1')}
      >
        {shown.map((b) => (
          <ToggleGroupItem
            key={b}
            value={b}
            className={cn(
              'px-2.5 num text-xs data-[state=on]:bg-foreground data-[state=on]:text-background',
              fill && 'flex-1',
            )}
          >
            {b}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function IntervalPicker() {
  const { selected, toggle, reset } = useIntervals()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="Choose intervals">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Intervals</h2>
          <p className="text-xs text-pretty text-muted-foreground">
            Pick the timeframes the bar shows. Number keys <span className="whitespace-nowrap">1–9</span> jump between
            them.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BARS.map((b) => {
            const at = selected.indexOf(b)
            const on = at >= 0
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(b)}
                disabled={on && selected.length === 1}
                className={cn(
                  'relative h-9 border num text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed',
                  on
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                )}
              >
                {b}
                {on && at < 9 && (
                  <span className="absolute top-0.5 right-1 text-[11px] leading-none text-muted-foreground">
                    {at + 1}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between border-t border-hairline pt-3 text-xs text-muted-foreground">
          <span className="num">{selected.length} selected</span>
          <Button variant="ghost" size="xs" onClick={reset}>
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Number keys 1–9 pick the matching selected interval. Ignored while typing. */
export function useIntervalHotkeys(onChange: (bar: Bar) => void) {
  const { selected } = useIntervals()
  const live = useRef({ selected, onChange })
  live.current = { selected, onChange }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      const bar = live.current.selected[Number(e.key) - 1]
      if (!bar) return
      e.preventDefault()
      live.current.onChange(bar)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
