import { Link, createFileRoute } from '@tanstack/react-router'
import { Rewind } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { STRATEGIES, type Strategy } from '@/lib/strategies'

// The strategies you can run on the replay chart, written out as the checklist the chart shows: one ruled row per
// rule, what it checks in a sentence. A fixed list for now; running one is a link into the replay.

export const Route = createFileRoute('/(main)/(market)/strategies')({
  head: () => ({ meta: [{ title: 'Strategies · crypz' }] }),
  component: Strategies,
})

function Strategies() {
  return (
    <>
      <PageHeader title="Strategies" />
      <main className="flex max-w-3xl flex-col gap-12 px-4 py-6 sm:px-8">
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Each strategy is a checklist. Run one in the replay and it floats over the chart, filling in green as its
          rules are met. It reads only the candles revealed so far, with its own fixed settings, so the indicator menu
          never changes what it says.
        </p>
        {STRATEGIES.map((s) => (
          <StrategyBlock key={s.id} strategy={s} />
        ))}
      </main>
    </>
  )
}

function StrategyBlock({ strategy: s }: { strategy: Strategy }) {
  return (
    <section aria-labelledby={s.id}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={s.id} className="text-lg font-semibold tracking-tight">
            {s.name}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">{s.summary}</p>
        </div>
        <Button size="sm" asChild className="shrink-0">
          <Link to="/trade/replay" search={{ strategy: s.id }}>
            <Rewind />
            Run in replay
          </Link>
        </Button>
      </div>
      <p className="mt-3 num text-[11px] text-muted-foreground">
        Reads {s.frames.join(' · ')} whatever the chart’s interval · {s.settings}
      </p>
      <h3 className="mt-6 border-b border-border pb-2 label">Rules, all of them</h3>
      <ul>
        {s.rules.map((r) => (
          <li key={r.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 border-b border-hairline py-3">
            <i aria-hidden className="mt-1.5 size-2 shadow-[inset_0_0_0_1px_var(--foreground)]" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{r.hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
