import { useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { Position } from '@crypz/exchanges'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EMPTY_FILTER, SORT_LABELS, applyFilter, type PositionFilter, type SortKey } from '@/lib/position-filter'
import { cn } from '@/lib/utils'

const ON = 'data-[state=on]:bg-foreground data-[state=on]:text-background'

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-7 border px-2.5 num text-xs transition-colors',
        on ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 flex w-full items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])

type Props = {
  positions: Position[]
  value: PositionFilter
  onApply: (f: PositionFilter) => void
  activeCount: number
}

/** Edits a draft; nothing changes in the table until Apply. */
export function HistoryFilterDialog({ positions, value, onApply, activeCount }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const set = (patch: Partial<PositionFilter>) => setDraft((d) => ({ ...d, ...patch }))

  const assets = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of positions) n.set(p.base, (n.get(p.base) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])
  }, [positions])
  const leverages = useMemo(() => [...new Set(positions.map((p) => p.leverage))].sort((a, b) => a - b), [positions])
  const matches = useMemo(() => applyFilter(positions, draft).length, [positions, draft])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(value)
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal /> Filter
          {activeCount > 0 && (
            <span className="grid size-5 place-items-center bg-foreground num text-[11px] text-background">
              {activeCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(88dvh,760px)] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle>Filter positions</DialogTitle>
          <DialogDescription>
            Narrow the history, then apply. Results update the table and its summary.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-7 overflow-y-auto px-6 py-6">
          <Field label="Assets" hint={draft.assets.length ? `${draft.assets.length} selected` : 'All'}>
            <div className="flex flex-wrap gap-1.5">
              {assets.map(([a, n]) => (
                <Chip key={a} on={draft.assets.includes(a)} onClick={() => set({ assets: toggle(draft.assets, a) })}>
                  {a} <span className="opacity-60">{n}</span>
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid gap-7 sm:grid-cols-2">
            <Field label="Side">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={draft.side}
                onValueChange={(v) => v && set({ side: v as PositionFilter['side'] })}
              >
                {(['all', 'long', 'short'] as const).map((s) => (
                  <ToggleGroupItem key={s} value={s} className={cn('flex-1 capitalize', ON)}>
                    {s}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field label="Result">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={draft.result}
                onValueChange={(v) => v && set({ result: v as PositionFilter['result'] })}
              >
                <ToggleGroupItem value="all" className={cn('flex-1', ON)}>
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="win" className={cn('flex-1', ON)}>
                  Winners
                </ToggleGroupItem>
                <ToggleGroupItem value="loss" className={cn('flex-1', ON)}>
                  Losers
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>

          <Field label="Leverage" hint={draft.leverage.length ? undefined : 'All'}>
            <div className="flex flex-wrap gap-1.5">
              {leverages.map((l) => (
                <Chip
                  key={l}
                  on={draft.leverage.includes(l)}
                  onClick={() => set({ leverage: toggle(draft.leverage, l) })}
                >
                  {l}x
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid gap-7 sm:grid-cols-2">
            <Field label="Closed between">
              <div className="grid grid-cols-2 gap-2">
                <Label className="sr-only" htmlFor="f-from">
                  From
                </Label>
                <Input id="f-from" type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} />
                <Label className="sr-only" htmlFor="f-to">
                  To
                </Label>
                <Input id="f-to" type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} />
              </div>
            </Field>
            <Field label="Realized PnL" hint="USDT">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="Min"
                  aria-label="Minimum realized PnL"
                  className="num"
                  value={draft.minPnl}
                  onChange={(e) => set({ minPnl: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  placeholder="Max"
                  aria-label="Maximum realized PnL"
                  className="num"
                  value={draft.maxPnl}
                  onChange={(e) => set({ maxPnl: e.target.value })}
                />
              </div>
            </Field>
          </div>

          <Field label="Sort">
            <Select value={draft.sort} onValueChange={(v) => set({ sort: v as SortKey })}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Sort order">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY_FILTER)}>
            Reset
          </Button>
          <Button
            disabled={!matches}
            onClick={() => {
              onApply(draft)
              setOpen(false)
            }}
          >
            {matches ? `Show ${matches} position${matches === 1 ? '' : 's'}` : 'No positions match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
