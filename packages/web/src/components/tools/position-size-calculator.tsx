import { useMemo } from 'react'
import { RotateCcw, Sigma } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DEFAULT_INPUT,
  calculate,
  validate,
  type PositionSizeInput,
  type PositionSizeResult,
} from '@/lib/calc/position-size'
import { searchText } from '@/lib/search'
import { Field, NumberInput, Stat, fmt, fmtMoney, parse } from './kit'
import { cn } from '@/lib/utils'
import { tone } from '@/lib/format'

export type Draft = Record<Exclude<keyof PositionSizeInput, 'currency' | 'direction'>, string> &
  Pick<PositionSizeInput, 'currency' | 'direction'>

const toDraft = (i: PositionSizeInput): Draft => ({
  equity: String(i.equity),
  currency: i.currency,
  riskPct: String(i.riskPct),
  direction: i.direction,
  entry: i.entry ? String(i.entry) : '',
  stop: i.stop ? String(i.stop) : '',
  rr: String(i.rr),
  idrRate: i.idrRate ? String(i.idrRate) : '',
})

export const DEFAULT_DRAFT = toDraft(DEFAULT_INPUT)

/** Turn untrusted URL search params into a partial draft (unknown keys and bad enums dropped). */
export function parseDraft(search: Record<string, unknown>): Partial<Draft> {
  const out: Partial<Draft> = {}
  for (const k of ['equity', 'riskPct', 'entry', 'stop', 'rr', 'idrRate'] as const) {
    const v = searchText(search[k])
    if (v !== undefined) out[k] = v.slice(0, 32)
  }
  if (search.currency === 'USDT' || search.currency === 'USD' || search.currency === 'IDR')
    out.currency = search.currency
  if (search.direction === 'long' || search.direction === 'short') out.direction = search.direction
  return out
}

const toInput = (d: Draft): PositionSizeInput => ({
  equity: parse(d.equity),
  currency: d.currency,
  riskPct: parse(d.riskPct),
  direction: d.direction,
  entry: parse(d.entry),
  stop: parse(d.stop),
  rr: parse(d.rr),
  idrRate: d.idrRate.trim() === '' ? 0 : parse(d.idrRate),
})

const fmtPriceAuto = (n: number) => fmt(n, n >= 1000 ? 2 : n >= 1 ? 4 : 8)
const fmtUnits = (n: number) => fmt(n, n >= 100 ? 2 : n >= 1 ? 4 : 8)
const fmtIdr = (n: number) =>
  `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

/** What the amounts are shown in: the equity's currency, with the other denomination as a second line. */
type Money = {
  /** Amount with its unit: "1,200.00 USDT", or "Rp19.200.000" when sizing in rupiah. */
  show: (n: number) => string
  /** The same with a sign, for gains and losses. */
  signed: (n: number) => string
  /** The other denomination, under the figure: rupiah for USDT/USD, USDT for rupiah; undefined with no rate. */
  alt: (n: number) => string | undefined
}

function moneyIn(cur: PositionSizeInput['currency'], idr: number | null): Money {
  if (cur === 'IDR')
    return {
      show: (n) => (idr ? fmtIdr(n * idr) : '–'),
      signed: (n) => (idr ? `${n > 0 ? '+' : ''}${fmtIdr(n * idr)}` : '–'),
      alt: (n) => `≈ ${fmtMoney(n)} USDT`,
    }
  return {
    show: (n) => `${fmtMoney(n)} ${cur}`,
    signed: (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMoney(Math.abs(n))} ${cur}`,
    alt: (n) => (idr ? `≈ ${fmtIdr(n * idr)}` : undefined),
  }
}

/** Controlled: the route owns the draft (kept in the URL, so a setup is shareable and survives reloads). */
export function PositionSizeCalculator({
  draft,
  onChange: set,
  onReset,
}: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onReset: () => void
}) {
  const input = useMemo(() => toInput(draft), [draft])
  const errors = useMemo(() => validate(input), [input])
  const result = useMemo(() => calculate(input), [input])
  const cur = input.currency
  const quote = cur === 'IDR' ? 'USDT' : cur
  const idr = input.idrRate > 0 ? input.idrRate : null

  // Moving between rupiah and dollars keeps the same money: the equity is converted at the rate, not relabelled.
  const switchCurrency = (next: Draft['currency']) => {
    const equity = input.equity
    const rate = input.idrRate
    if (Number.isFinite(equity) && rate > 0 && (cur === 'IDR') !== (next === 'IDR'))
      set({ currency: next, equity: String(Math.round((next === 'IDR' ? equity * rate : equity / rate) * 100) / 100) })
    else set({ currency: next })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section aria-labelledby="setup-title" className="flex flex-col gap-6 border border-border p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 id="setup-title" className="text-lg font-medium tracking-tight">
            Trade setup
          </h2>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw /> Reset
          </Button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <Field
            id="equity"
            label="Equity"
            hint={
              cur === 'IDR' ? 'In rupiah. Converted to USDT at the rate below.' : 'Total trading capital available.'
            }
            error={errors.equity}
          >
            <NumberInput
              id="equity"
              value={draft.equity}
              onChange={(v) => set({ equity: v })}
              invalid={!!errors.equity}
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Select value={draft.currency} onValueChange={(v) => switchCurrency(v as Draft['currency'])}>
              <SelectTrigger id="currency" className="h-11! w-full num">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="IDR">IDR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            id="riskPct"
            label="Risk per trade"
            suffix="%"
            hint="Most of equity you accept losing on this trade."
            error={errors.riskPct}
          >
            <NumberInput
              id="riskPct"
              value={draft.riskPct}
              onChange={(v) => set({ riskPct: v })}
              invalid={!!errors.riskPct}
              className="pr-8"
            />
          </Field>
          <div className="flex flex-col gap-2">
            <Label id="direction-label">Direction</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={draft.direction}
              onValueChange={(v) => v && set({ direction: v as Draft['direction'] })}
              aria-labelledby="direction-label"
              className="w-full"
            >
              {(['long', 'short'] as const).map((d) => (
                <ToggleGroupItem
                  key={d}
                  value={d}
                  className="h-11 flex-1 capitalize data-[state=on]:bg-foreground data-[state=on]:text-background"
                >
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="entry" label="Entry price" error={errors.entry}>
            <NumberInput id="entry" value={draft.entry} onChange={(v) => set({ entry: v })} invalid={!!errors.entry} />
          </Field>
          <Field
            id="stop"
            label="Stop loss price"
            hint={draft.direction === 'long' ? 'Must be below entry.' : 'Must be above entry.'}
            error={errors.stop}
          >
            <NumberInput id="stop" value={draft.stop} onChange={(v) => set({ stop: v })} invalid={!!errors.stop} />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="rr" label="Risk : reward" hint="Take profit is derived from this multiple." error={errors.rr}>
            <div className="flex items-center">
              <span className="grid h-11 shrink-0 place-items-center border border-r-0 border-input px-3 num text-sm whitespace-nowrap text-muted-foreground">
                1 :
              </span>
              <NumberInput id="rr" value={draft.rr} onChange={(v) => set({ rr: v })} invalid={!!errors.rr} />
            </div>
          </Field>
          <Field
            id="idrRate"
            label={`${quote} to IDR`}
            hint={
              cur === 'IDR'
                ? 'Required: rupiah per 1 USDT. Entry and stop prices are in USDT.'
                : 'Rupiah per 1 USDT. Leave empty to hide rupiah. No live rates are fetched.'
            }
            error={errors.idrRate}
          >
            <div className="flex items-center">
              <span className="grid h-11 shrink-0 place-items-center border border-r-0 border-input px-3 num text-sm whitespace-nowrap text-muted-foreground">
                1 {quote} =
              </span>
              <NumberInput
                id="idrRate"
                value={draft.idrRate}
                onChange={(v) => set({ idrRate: v })}
                invalid={!!errors.idrRate}
                className="pr-12"
              />
            </div>
          </Field>
        </div>
      </section>

      <Results input={input} result={result} idr={idr} />
    </div>
  )
}

function riskVerdict(pct: number) {
  if (pct <= 1) return 'Conservative: at or under 1% of equity.'
  if (pct <= 2) return 'Within the common 1–2% per-trade guideline.'
  if (pct <= 5) return 'Aggressive: above the common 2% guideline.'
  return 'Very aggressive: a short losing streak can do serious damage.'
}

function Results({
  input,
  result: r,
  idr,
}: {
  input: PositionSizeInput
  result: PositionSizeResult | null
  idr: number | null
}) {
  const money = moneyIn(input.currency, idr)

  return (
    <section aria-labelledby="results-title" aria-live="polite" className="flex flex-col border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
        <h2 id="results-title" className="text-lg font-medium tracking-tight">
          Result
        </h2>
        <FormulaDialog input={input} result={r} />
      </div>

      {!r ? (
        <p className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
          Fix the highlighted fields to see your position size.
        </p>
      ) : (
        <>
          <div className="grid gap-6 border-b border-hairline px-5 py-6 sm:px-7">
            <dl className="grid grid-cols-2 gap-6">
              <Stat label="Position size" value={`${fmtUnits(r.size)} ${r.size === 1 ? 'unit' : 'units'}`} large />
              <Stat label="Position value" value={money.show(r.value)} sub={money.alt(r.value)} />
            </dl>
            <dl className="grid grid-cols-2 gap-6">
              <Stat label="Risk per trade" value={`${fmt(input.riskPct, 2)}%`} />
              <Stat
                label="Max risk"
                value={money.show(r.riskAmount)}
                className="text-down"
                sub={money.alt(r.riskAmount)}
              />
            </dl>
            <p className="flex items-start gap-2.5 text-sm">
              <i
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0',
                  input.riskPct <= 2 ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]',
                )}
              />
              {riskVerdict(input.riskPct)}
            </p>
          </div>

          <div className="grid gap-6 border-b border-hairline px-5 py-6 sm:grid-cols-2 sm:px-7">
            <dl className="grid content-start gap-6">
              <Stat label="Position vs equity" value={`${fmt(r.pctOfEquity, 2)}%`} />
              <Stat
                label="Leverage needed"
                value={r.minLeverage <= 1 ? 'None' : `≥ ${r.minLeverage}x`}
                sub={
                  r.minLeverage > 1
                    ? `Margin at ${r.minLeverage}x ≈ ${money.show(r.value / r.minLeverage)}`
                    : 'Position fits inside equity.'
                }
              />
            </dl>
            <Ladder input={input} r={r} />
          </div>

          <dl className="grid grid-cols-2 gap-6 px-5 py-6 sm:px-7">
            <Stat
              label="If stop is hit"
              value={money.signed(r.maxLoss)}
              className={tone(r.maxLoss)}
              sub={money.alt(r.maxLoss)}
            />
            <Stat
              label="If target is hit"
              value={money.signed(r.potentialProfit)}
              className={tone(r.potentialProfit)}
              sub={money.alt(r.potentialProfit)}
            />
          </dl>
          <p className="mt-auto border-t border-border px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">
            Sizing assumes the stop fills exactly. Fees, slippage, funding, spread and liquidation are not included.
          </p>
        </>
      )}
    </section>
  )
}

/** Target, entry and stop drawn to scale on one rule. */
function Ladder({ input, r }: { input: PositionSizeInput; r: PositionSizeResult }) {
  const levels = [
    { key: 'tp', label: 'Take profit', price: r.takeProfit, note: `+${fmt(r.rewardDistancePct, 2)}%`, cls: 'text-up' },
    { key: 'entry', label: 'Entry', price: input.entry, note: `1 : ${fmt(input.rr, 2)}`, cls: '' },
    { key: 'sl', label: 'Stop loss', price: input.stop, note: `−${fmt(r.riskDistancePct, 2)}%`, cls: 'text-down' },
  ].sort((a, b) => b.price - a.price)
  const hi = levels[0].price
  const lo = levels[2].price
  // to scale, but the middle row keeps a minimum gap so labels never collide
  const y = (p: number, i: number) => (i === 1 ? Math.min(78, Math.max(22, ((hi - p) / (hi - lo || 1)) * 100)) : i * 50)

  return (
    <div className="flex flex-col gap-3">
      <span className="label">Trade levels</span>
      <div className="relative my-2 h-44">
        <i aria-hidden className="absolute top-0 bottom-0 left-[5px] w-px bg-border" />
        {levels.map((l, i) => (
          <div
            key={l.key}
            className="absolute right-0 left-0 flex -translate-y-1/2 items-center gap-3"
            style={{ top: `${y(l.price, i)}%` }}
          >
            <i
              aria-hidden
              className={cn(
                'size-[11px] shrink-0',
                l.key === 'entry' ? 'bg-foreground' : 'bg-background shadow-[inset_0_0_0_1px_var(--foreground)]',
              )}
            />
            <span className="w-24 text-sm text-muted-foreground">{l.label}</span>
            <span className={cn('num text-sm font-medium', l.cls)}>{fmtPriceAuto(l.price)}</span>
            <span className="ml-auto num text-xs text-muted-foreground">{l.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FormulaDialog({ input: i, result: r }: { input: PositionSizeInput; result: PositionSizeResult | null }) {
  // prices are in USDT, so the sums run in USDT even when the equity is typed in rupiah
  const cur = i.currency === 'IDR' ? 'USDT' : i.currency
  const long = i.direction === 'long'
  const convert =
    i.currency === 'IDR'
      ? [
          {
            title: 'Equity in USDT',
            formula: 'Equity in IDR ÷ IDR per USDT',
            live: r && `${fmt(i.equity, 0)} ÷ ${fmt(i.idrRate, 2)} = ${fmtMoney(r.equity)} USDT`,
          },
        ]
      : []
  const rows = [
    ...convert,
    {
      title: 'Risk amount',
      formula: 'Equity × Risk %',
      live: r && `${fmt(r.equity)} × ${fmt(i.riskPct, 2)}% = ${fmtMoney(r.riskAmount)} ${cur}`,
    },
    {
      title: 'Risk per unit',
      formula: long ? 'Entry − Stop loss   (long)' : 'Stop loss − Entry   (short)',
      live:
        r &&
        (long ? `${fmt(i.entry, 8)} − ${fmt(i.stop, 8)}` : `${fmt(i.stop, 8)} − ${fmt(i.entry, 8)}`) +
          ` = ${fmt(r.riskPerUnit, 8)}`,
    },
    {
      title: 'Position size',
      formula: 'Risk amount ÷ Risk per unit',
      live:
        r &&
        `${fmtMoney(r.riskAmount)} ÷ ${fmt(r.riskPerUnit, 8)} = ${fmtUnits(r.size)} ${r.size === 1 ? 'unit' : 'units'}`,
    },
    {
      title: 'Position value',
      formula: 'Position size × Entry',
      live: r && `${fmtUnits(r.size)} × ${fmt(i.entry, 8)} = ${fmtMoney(r.value)} ${cur}`,
    },
    {
      title: 'Position % of equity',
      formula: 'Position value ÷ Equity × 100%',
      live: r && `${fmtMoney(r.value)} ÷ ${fmt(r.equity)} × 100% = ${fmt(r.pctOfEquity, 2)}%`,
    },
    {
      title: 'Take profit',
      formula: long ? 'Entry + Risk per unit × RR   (long)' : 'Entry − Risk per unit × RR   (short)',
      live:
        r &&
        `${fmt(i.entry, 8)} ${long ? '+' : '−'} ${fmt(r.riskPerUnit, 8)} × ${fmt(i.rr, 2)} = ${fmtPriceAuto(r.takeProfit)}`,
    },
    {
      title: 'Leverage needed',
      formula: 'ceil(Position % of equity ÷ 100), minimum 1x',
      live: r && `ceil(${fmt(r.pctOfEquity, 2)} ÷ 100) = ${r.minLeverage}x`,
    },
  ]

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sigma /> Formulas
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(88dvh,820px)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle>How the size is calculated</DialogTitle>
          <DialogDescription>
            Each step with your current numbers ({i.direction}). Change an input and these update.
          </DialogDescription>
        </DialogHeader>
        <ol className="overflow-y-auto">
          {rows.map((row, k) => (
            <li
              key={row.title}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-hairline px-6 py-4"
            >
              <span className="num text-sm text-muted-foreground">{k + 1}</span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium">{row.title}</span>
                <code className="num text-sm break-words">{`${row.title} = ${row.formula}`}</code>
                <code className="num text-xs break-words text-muted-foreground">
                  {row.live ? `= ${row.live}` : 'Fill in valid inputs to see the numbers.'}
                </code>
              </div>
            </li>
          ))}
        </ol>
        <p className="px-6 py-4 text-xs leading-relaxed text-muted-foreground">
          The size is based on the loss you plan to take at the stop. It does not guarantee execution at the exact stop
          price. Fees, slippage, funding, spread and liquidation risk are not included.
        </p>
      </DialogContent>
    </Dialog>
  )
}
