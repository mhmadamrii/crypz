import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// What the public calculators share: number parsing and formatting, and the form field, number input and result
// stat they are built from.

export const parse = (s: string) => {
  const n = Number(s.replace(/,/g, '').trim())
  return s.trim() === '' || Number.isNaN(n) ? NaN : n
}

// Formatting: keep enough precision for cheap coins, never more than 8 decimals.
export const fmt = (n: number, max = 2) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: max }) : '–'
export const fmtMoney = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'

export function Field({
  id,
  label,
  hint,
  error,
  suffix,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  suffix?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {children}
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 num text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${id}-msg`} className="text-xs text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function NumberInput({
  id,
  value,
  onChange,
  invalid,
  className,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  className?: string
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      aria-invalid={invalid || undefined}
      aria-describedby={`${id}-msg`}
      onChange={(e) => onChange(e.target.value)}
      className={cn('h-11 num text-base', className)}
    />
  )
}

export function Stat({
  label,
  value,
  sub,
  className,
  large,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  className?: string
  large?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="label">{label}</dt>
      <dd
        className={cn(
          'num font-medium tracking-tight break-words',
          large ? 'text-3xl sm:text-4xl' : 'text-xl',
          className,
        )}
      >
        {value}
      </dd>
      {sub && <dd className="num text-xs text-muted-foreground">{sub}</dd>}
    </div>
  )
}
