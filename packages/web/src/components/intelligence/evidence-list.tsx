import { ChevronDown } from 'lucide-react'
import type { EngineId, MarketIntelligence } from '@/lib/intelligence/types'
import type { WidgetKind } from '@/components/workspace/model'
import { WIDGETS } from '@/components/workspace/widgets'
import { Button } from '@/components/ui/button'
import { FRESHNESS_WORD, Section, StateTag, ago } from './kit'

/** The five engines, one voice each. Correlated widgets sit under one engine so they are never counted twice. */
export function EvidenceList({
  a,
  onOpen,
}: {
  a: MarketIntelligence
  onOpen: (kinds: WidgetKind[], engine?: EngineId) => void
}) {
  return (
    <Section
      title="Evidence"
      note="Each engine groups widgets that describe the same thing and counts once. Open any of them to see the data itself."
    >
      <ul className="flex flex-col">
        {a.engines.map((e) => (
          <li key={e.id}>
            <details className="group border-b border-hairline">
              <summary className="flex cursor-pointer list-none flex-col gap-1 py-3 marker:hidden hover:bg-accent/50 focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3">
                  <span className="text-sm font-medium">{e.title}</span>
                  <StateTag state={e.state} />
                  <span className="ml-auto flex items-center gap-2 num text-xs text-muted-foreground">
                    {FRESHNESS_WORD[e.freshness]}
                    <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
                    <span className="sr-only">, show why</span>
                  </span>
                </span>
                <span className="max-w-prose text-sm text-pretty text-muted-foreground">{e.reason}</span>
              </summary>
              <div className="flex flex-col gap-3 pb-4 pl-5">
                {e.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">No readable data behind this engine right now.</p>
                )}
                <ul className="flex flex-col gap-2">
                  {e.items.map((it) => (
                    <li key={it.id} className="flex flex-col gap-1 text-sm">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StateTag state={it.state} />
                        <span className="num text-[11px] text-muted-foreground">
                          {it.votes ? 'Counted' : 'Context only'} · {FRESHNESS_WORD[it.freshness]} ·{' '}
                          {ago(a.asOf, it.observedAt)}
                        </span>
                      </span>
                      <span className="max-w-prose text-pretty">{it.summary}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {e.widgets.map((k) => (
                    <Button key={k} variant="outline" size="sm" onClick={() => onOpen([k], e.id)}>
                      Open {WIDGETS[k].title}
                    </Button>
                  ))}
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Section>
  )
}
