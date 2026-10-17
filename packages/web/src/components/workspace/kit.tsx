import { MARKET_EXCHANGE } from '@/lib/market'
import { cn } from '@/lib/utils'

// Small pieces every widget shares.

export const Waiting = ({ what }: { what?: string }) => (
  <p className="grid h-full place-items-center px-3 text-center label">
    {what ?? `Waiting for ${MARKET_EXCHANGE.toUpperCase()}…`}
  </p>
)

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

/** Price groupings from the price's magnitude: e.g. 0.1 / 1 / 10 for BTC near 80,000. */
export const stepsFor = (price: number) => {
  const base = 10 ** (Math.floor(Math.log10(price)) - 5)
  return [base, base * 10, base * 100]
}

export const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))

/** A setting that must be one of `options`, falling back to `fallback` when the saved value is gone or foreign. */
export const pick = <T extends string | number>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Sizes in a narrow cell: 0.42, 37, 4.2k, 38k, 1.2M, 2.5B. Zero is blank. */
export function fmtSize(n: number) {
  const a = Math.abs(n)
  if (!a) return ''
  const s = n < 0 ? '−' : ''
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${s}${Math.round(a / 1e3)}k`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}k`
  if (a >= 10) return `${s}${Math.round(a)}`
  return `${s}${a.toFixed(2)}`
}

/** A signed change: +4.2k, −310, 0. */
export const signedSize = (n: number) => (n > 0 ? `+${fmtSize(n)}` : fmtSize(n) || '0')

/** USD amounts: $2.51B, $940k. */
export const fmtUsd = (n: number) => (n < 0 ? `−$${fmtSize(-n)}` : `$${fmtSize(n) || '0'}`)

/** A signed USD change: +$15.7M, −$2.5M. */
export const signedUsd = (n: number) => (n > 0 ? `+${fmtUsd(n)}` : fmtUsd(n))

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
