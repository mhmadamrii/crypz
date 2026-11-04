import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MARKET_EXCHANGE_NAME } from '@/lib/market'
import { WIDGETS, type Settings } from '@/components/workspace/widgets'
import type { WidgetKind } from '@/components/workspace/model'
import { cn } from '@/lib/utils'
import { Section } from './kit'

// The widgets themselves, behind one control. They are the workspace's own components on the same data feeds, so
// nothing is re-implemented and opening one here costs no extra connection. At most four are open at once.

const GROUPS: { title: string; kinds: WidgetKind[] }[] = [
  { title: 'Market structure', kinds: ['chart', 'stats', 'profile'] },
  { title: 'Liquidity', kinds: ['book', 'depth', 'liquidity'] },
  { title: 'Aggressive flow', kinds: ['trades', 'cvd', 'footprint', 'taker'] },
  { title: 'Positioning', kinds: ['oi', 'longshort', 'basis'] },
  { title: 'Forced flows', kinds: ['liquidations'] },
]
const MAX_OPEN = 4

export function DrillDown({
  symbol,
  open,
  onToggle,
  selected,
  onSelect,
  anchor,
}: {
  symbol: string
  open: boolean
  onToggle: () => void
  selected: WidgetKind[]
  onSelect: (kinds: WidgetKind[]) => void
  anchor: React.RefObject<HTMLDivElement | null>
}) {
  // each widget keeps its own settings while the page is open
  const [settings, setSettings] = useState<Record<string, Settings>>({})
  const toggle = (k: WidgetKind) =>
    onSelect(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k].slice(-MAX_OPEN))

  return (
    <div ref={anchor} className="scroll-mt-20">
      <Section
        title="Explore evidence"
        note={`The widgets from the workspace, on ${MARKET_EXCHANGE_NAME}'s live feeds for ${symbol}.`}
        aside={
          <Button variant="outline" size="sm" aria-expanded={open} onClick={onToggle}>
            {open ? 'Hide detailed widgets' : 'Open detailed widgets'}
          </Button>
        }
      >
        {open && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {GROUPS.map((g) => (
                <div key={g.title} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-36 shrink-0 label">{g.title}</span>
                  {g.kinds.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={selected.includes(k)}
                      onClick={() => toggle(k)}
                      className={cn(
                        'h-7 border border-border px-2.5 num text-xs hover:bg-accent focus-visible:outline-2',
                        selected.includes(k) && 'border-foreground bg-foreground text-background hover:bg-foreground',
                      )}
                    >
                      {WIDGETS[k].title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {selected.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pick up to {MAX_OPEN} widgets above.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {selected.map((k) => {
                  const w = WIDGETS[k]
                  const props = {
                    symbol,
                    settings: settings[k] ?? {},
                    set: (patch: Settings) => setSettings((s) => ({ ...s, [k]: { ...s[k], ...patch } })),
                  }
                  return (
                    <section
                      key={k}
                      aria-label={w.title}
                      className="flex h-[26rem] min-w-0 flex-col border border-border"
                    >
                      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
                        <h3 className="truncate text-sm font-medium">{w.title}</h3>
                        {w.Controls && <w.Controls {...props} />}
                      </header>
                      <div className="min-h-0 flex-1">
                        <w.Body {...props} />
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}
