import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { fmtNum, fmtPrice } from '@/lib/format'
import { riskWeight, targetFor, type Side } from '@/lib/replay'
import { cn } from '@/lib/utils'

export const RISK_MIN = 0.1
export const RISK_MAX = 5
export const RISK_STEP = 0.1

/** What the ticket would trade: worked out from the risk, the stop and the entry, never typed. */
export type RiskSizing = {
  /** Base units (e.g. BTC). Null until there is equity to take a share of. */
  units: number | null
  notional: number | null
  riskAmount: number | null
  rewardAmount: number | null
  /** Margin as % of equity. */
  marginPct: number
  /** True when the stop is so tight that the margin would exceed equity at this leverage. */
  capped: boolean
  /** Leverage that would fit the full risk, when capped. */
  needLeverage: number | null
  target: number
}

/** Position size for an order at `entry` that risks `pct` % of `equity` between entry and `stop`. */
export function sizeByRisk(a: {
  side: Side
  entry: number
  stop: number
  leverage: number
  pct: number
  rr: number
  equity: number | null
}): RiskSizing {
  const dist = Math.abs(a.entry - a.stop) / a.entry
  const weight = riskWeight(a.pct, a.entry, a.stop, a.leverage)
  const notional = a.equity === null ? null : weight * a.leverage * a.equity
  const riskAmount = notional === null ? null : notional * dist
  const full = a.pct / 100 / dist
  return {
    units: notional === null ? null : notional / a.entry,
    notional,
    riskAmount,
    rewardAmount: riskAmount === null ? null : riskAmount * a.rr,
    marginPct: weight * 100,
    capped: full > a.leverage,
    needLeverage: full > a.leverage ? Math.ceil(full) : null,
    target: targetFor(a.side, a.entry, a.stop, a.rr),
  }
}

export function RiskSection({
  on,
  onOn,
  open,
  onOpen,
  pct,
  onPct,
  rr,
  onRr,
  base,
  sizing,
  hint,
  locked,
}: {
  on: boolean
  onOn: (v: boolean) => void
  open: boolean
  onOpen: (v: boolean) => void
  pct: number
  onPct: (v: number) => void
  /** Raw field text of the reward multiple (the R in 1:R). */
  rr: string
  onRr: (v: string) => void
  /** The asset the size is counted in. */
  base: string
  sizing: RiskSizing | null
  /** Why there is no size yet, when there is none. */
  hint: string | null
  /** An order is waiting or open: the settings it was placed with are shown, not edited. */
  locked?: boolean
}) {
  return (
    <section className="flex flex-col rounded-md border border-border" aria-label="Risk per trade">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={() => onOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left label"
        >
          <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
          Risk per trade
          {on && <span className="num text-foreground normal-case">{fmtNum(pct, 1)}%</span>}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Size by risk"
          disabled={locked}
          onClick={() => onOn(!on)}
          className={cn(
            'relative h-4 w-7 shrink-0 rounded-full border border-border transition-colors disabled:opacity-50',
            on ? 'bg-foreground' : 'bg-transparent',
          )}
        >
          <span
            className={cn(
              'absolute top-px left-px size-3 rounded-full transition-transform',
              on ? 'translate-x-3 bg-background' : 'bg-muted-foreground',
            )}
          />
        </button>
      </div>

      {open && (
        <div className={cn('flex flex-col gap-3 border-t border-hairline px-2.5 py-3', !on && 'opacity-50')}>
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between label">
              Risk
              <span className="num text-foreground normal-case">{fmtNum(pct, 1)}% of equity</span>
            </span>
            <input
              type="range"
              min={RISK_MIN}
              max={RISK_MAX}
              step={RISK_STEP}
              value={pct}
              disabled={!on || locked}
              onChange={(e) => onPct(Number(e.target.value))}
              aria-label="Risk per trade, % of equity"
              className="h-4 w-full accent-foreground disabled:cursor-not-allowed"
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="label">Reward : risk</span>
            <span className="flex items-center gap-1.5 num text-sm">
              <Input
                inputMode="decimal"
                value={rr}
                disabled={!on || locked}
                onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onRr(e.target.value)}
                aria-label="Reward multiple R in R:1"
                className="h-8 w-16 num text-sm"
              />
              <span className="text-muted-foreground">: 1</span>
            </span>
          </label>

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 num text-xs">
            <dt className="label">Size</dt>
            <dd className="text-right" data-slot="risk-size">
              {sizing?.units != null ? `${fmtUnits(sizing.units)} ${base}` : '–'}
            </dd>
            <dt className="label">Notional</dt>
            <dd className="text-right">{sizing?.notional != null ? `${fmtNum(sizing.notional)} USDT` : '–'}</dd>
            <dt className="label">Margin</dt>
            <dd className="text-right">{sizing ? `${fmtNum(sizing.marginPct, 1)}% of equity` : '–'}</dd>
            <dt className="label">Risk / reward</dt>
            <dd className="text-right">
              <span className="text-down">{sizing?.riskAmount != null ? `−${fmtNum(sizing.riskAmount)}` : '–'}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-up">{sizing?.rewardAmount != null ? `+${fmtNum(sizing.rewardAmount)}` : '–'}</span>
            </dd>
            <dt className="label">Target</dt>
            <dd className="text-right">{sizing ? fmtPrice(sizing.target) : '–'}</dd>
          </dl>

          {sizing?.capped ? (
            <p className="text-xs text-pretty text-down">
              Stop is too tight for this leverage: the whole equity is margin and risk is less than chosen.
              {sizing.needLeverage ? ` ${sizing.needLeverage}× or more fits it.` : ''}
            </p>
          ) : hint ? (
            <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
          ) : (
            <p className="text-xs text-pretty text-muted-foreground">
              If the limit order fills away from its line, stop and target move with the fill.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

const fmtUnits = (n: number) => (n >= 100 ? fmtNum(n, 2) : n >= 1 ? fmtNum(n, 3) : fmtNum(n, 5))
