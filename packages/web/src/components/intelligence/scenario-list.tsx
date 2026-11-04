import { ChevronDown } from 'lucide-react'
import { fmtPrice } from '@/lib/format'
import { SCENARIOS } from '@/lib/intelligence/scenarios'
import type { MarketIntelligence, Scenario } from '@/lib/intelligence/types'
import { cn } from '@/lib/utils'
import { Meter, Section } from './kit'

const RANK = {
  favored: { word: 'Favored', filled: 3 },
  possible: { word: 'Possible', filled: 2 },
  less_likely: { word: 'Less likely', filled: 1 },
} as const

/**
 * The next-scenario panel. Ranks, never percentages: the qualitative engine has not been measured against history, so
 * it does not get to print a number. Each scenario opens into its evidence, the condition that confirms it, and the
 * one that kills it.
 */
export function ScenarioList({ a }: { a: MarketIntelligence }) {
  const levels = new Map(a.keyLevels.map((l) => [l.id, l]))
  return (
    <Section
      title={`Next ${a.horizon}: scenario bias`}
      note={`Qualitative bias, ranked by fixed rules over the evidence. Not probabilities: nothing here has been measured against history yet, so no percentages are shown. Each scenario is a single outcome of the next ${a.windowBars} × ${a.bar} bars.`}
      aside={<span className="num text-[11px] text-muted-foreground">Rules {a.model.version} · uncalibrated</span>}
    >
      <ol className="flex flex-col">
        {a.scenarios.map((s, i) => (
          <li key={s.id}>
            <Row s={s} lead={i === 0 && s.applicable} levels={levels} />
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Row({
  s,
  lead,
  levels,
}: {
  s: Scenario
  lead: boolean
  levels: Map<string, MarketIntelligence['keyLevels'][number]>
}) {
  const rank = RANK[s.qualitativeRank]
  const def = SCENARIOS[s.id]
  const dim = !s.applicable
  return (
    <details className="group border-b border-hairline">
      <summary
        className={cn(
          'flex cursor-pointer list-none flex-col gap-1.5 py-3 marker:hidden hover:bg-accent/50 focus-visible:outline-2 [&::-webkit-details-marker]:hidden',
          lead && 'bg-accent/60 px-3',
        )}
      >
        <span className="flex items-center gap-3">
          <Meter filled={dim ? 0 : rank.filled} />
          <span
            className={cn('font-medium', lead ? 'text-lg tracking-tight' : 'text-sm', dim && 'text-muted-foreground')}
          >
            {def.name}
          </span>
          <span className="ml-auto flex items-center gap-2 num text-xs text-muted-foreground">
            {dim ? 'Not applicable' : rank.word}
            <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
            <span className="sr-only">, show why</span>
          </span>
        </span>
        <span
          className={cn('max-w-prose text-sm text-pretty', dim ? 'text-muted-foreground' : 'text-muted-foreground')}
        >
          {s.explanation}
        </span>
      </summary>
      <div className={cn('grid gap-x-8 gap-y-4 pb-4 text-sm sm:grid-cols-2', lead ? 'px-3' : 'pl-5')}>
        {s.applicable && (
          <>
            <Block
              title="Supporting evidence"
              empty="Nothing in the evidence supports it directly."
              items={s.supportingEvidence}
            />
            <Block
              title="Conflicting evidence"
              empty="Nothing in the evidence argues against it."
              items={s.conflictingEvidence}
            />
            <div className="flex flex-col gap-1">
              <h3 className="label">Confirmation</h3>
              <p className="text-pretty">{s.trigger}</p>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="label">Invalidation</h3>
              <p className="text-pretty">{s.invalidation}</p>
            </div>
          </>
        )}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <h3 className="label">What it means</h3>
          <p className="text-pretty text-muted-foreground">{def.definition}</p>
          <p className="num text-xs text-muted-foreground">
            {s.keyLevelIds
              .map((id) => levels.get(id))
              .filter((l) => l !== undefined)
              .map((l) => `${l.source}: ${fmtPrice(l.price)}`)
              .join(' · ')}
          </p>
        </div>
      </div>
    </details>
  )
}

function Block({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="label">{title}</h3>
      {items.length ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((x) => (
            <li key={x} className="text-pretty">
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
