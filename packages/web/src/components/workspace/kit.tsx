import { useSyncExternalStore, type ComponentProps } from 'react'
import { MARKET_EXCHANGE } from '@/lib/market'
import { Segmented } from '@/components/segmented'
import { cn } from '@/lib/utils'

// Small pieces every widget shares.

export const Waiting = ({ what }: { what?: string }) => (
  <p className="grid h-full place-items-center px-3 text-center label">
    {what ?? `Waiting for ${MARKET_EXCHANGE.toUpperCase()}…`}
  </p>
)

// Shared one-second clock for countdowns and freshness, so N widgets do not run N timers.
const clock = {
  listeners: new Set<() => void>(),
  now: Date.now(),
  timer: undefined as ReturnType<typeof setInterval> | undefined,
}
export const useNow = () =>
  useSyncExternalStore(
    (fn) => {
      clock.listeners.add(fn)
      if (!clock.timer) {
        // nothing has been ticking while no widget listened, so the stored time is old until the first tick
        clock.now = Date.now()
        clock.timer = setInterval(() => {
          clock.now = Date.now()
          for (const l of clock.listeners) l()
        }, 1000)
      }
      return () => {
        clock.listeners.delete(fn)
        if (!clock.listeners.size) {
          clearInterval(clock.timer)
          clock.timer = undefined
        }
      }
    },
    () => clock.now,
    () => 0,
  )

/** The row of a widget body that holds one setting: a label on the left, the options on the right. */
export function StripControl<T extends string | number>({
  text,
  hint,
  ...segmented
}: { text: string; hint?: string } & Omit<ComponentProps<typeof Segmented<T>>, 'size'>) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 py-0.5">
      <span className="truncate label" title={hint}>
        {text}
      </span>
      <Segmented {...segmented} size="strip" />
    </div>
  )
}

/** A two-tone share bar: `share` (0..1) is painted in the `fill` direction's colour over the other's. */
export function SplitBar({ share, fill, className }: { share: number; fill: 'up' | 'down'; className?: string }) {
  return (
    <div className={cn('flex h-1', fill === 'up' ? 'bg-down/50' : 'bg-up/50', className)}>
      <i className={cn('h-full', fill === 'up' ? 'bg-up/70' : 'bg-down/70')} style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** The size that only the biggest tenth of `sizes` reaches; Infinity when there is nothing to rank. */
export const p90 = (sizes: number[]) => [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length * 0.9)] ?? Infinity

/** A setting that must be one of `options`, falling back to `fallback` when the saved value is gone or foreign. */
export const pick = <T extends string | number>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

export const clockTime = (ms: number, seconds = false) =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  })

const dayMonth = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

/** When a period opened: the time today, the date and time before today, the date alone for daily periods. */
export function periodLabel(ms: number, bar: string) {
  if (bar === '1D') return dayMonth(ms)
  return new Date(ms).toDateString() === new Date().toDateString() ? clockTime(ms) : `${dayMonth(ms)} ${clockTime(ms)}`
}

/** An event time: with seconds over the last day, then the date. */
export const eventTime = (ms: number) => (Date.now() - ms < 86_400_000 ? clockTime(ms, true) : dayMonth(ms))
