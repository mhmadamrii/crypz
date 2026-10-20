import { useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import type { InsightsResult } from '@crypz/api'
import type { Insight } from '@crypz/exchanges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/workspace/kit'
import { insightsQuery, insightsStatusQuery, type InsightsScope } from '@/lib/queries'
import { cn } from '@/lib/utils'

// Insights for the scope the dashboard is showing. Fixed-rule readouts are always there; Gemini's read comes only
// when asked (it costs a call), and each scope keeps its answer. An AI insight shows the figures it rests on, how many
// trades are behind it, and whether those figures were found in the stats we sent: the reader sees how grounded it
// is instead of taking the prose on trust.

const MARK: Record<Insight['tone'], string> = {
  leak: 'shadow-[inset_0_0_0_1px_var(--foreground)]',
  edge: 'bg-foreground',
  note: 'bg-muted-foreground/40',
}

const VIEWS = ['Rules', 'Gemini'] as const
type View = (typeof VIEWS)[number]

export function Insights({
  insights,
  scope,
  request,
}: {
  insights: Insight[]
  scope?: string | null
  request: InsightsScope
}) {
  const status = useQuery(insightsStatusQuery())
  const ai = useQuery(insightsQuery(request))
  const configured = status.data?.configured === true
  const [picked, setPicked] = useState<View>('Gemini')
  // the Gemini view exists once there is something to show for this scope
  const hasAi = ai.data !== undefined || ai.isFetching || ai.isError
  const view: View = hasAi ? picked : 'Rules'

  const ask = () => {
    setPicked('Gemini')
    void ai.refetch()
  }

  return (
    <div className="flex h-full flex-col border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <svg viewBox="0 0 3 3" className="size-3" shapeRendering="crispEdges" aria-hidden>
            <rect x="0" y="0" width="1" height="1" fill="currentColor" />
            <rect x="2" y="0" width="1" height="1" fill="currentColor" />
            <rect x="1" y="1" width="1" height="1" fill="currentColor" />
            <rect x="0" y="2" width="1" height="1" fill="currentColor" />
            <rect x="2" y="2" width="1" height="1" fill="currentColor" />
          </svg>
          Insights
        </h3>
        {scope && <span className="mr-auto num text-xs text-muted-foreground">{scope}</span>}
        {hasAi ? (
          <Segmented label="Insight source" options={VIEWS} value={view} onChange={setPicked} />
        ) : configured ? (
          <Button variant="outline" size="xs" onClick={ask} disabled={insights.length === 0}>
            Read with Gemini
          </Button>
        ) : (
          <Badge variant="outline" className="num font-normal text-muted-foreground">
            {status.isPending ? 'Gemini' : 'Gemini · not connected'}
          </Badge>
        )}
      </div>

      {view === 'Rules' ? (
        <ol className="flex flex-1 flex-col">
          {insights.length ? (
            insights.map((i, n) => (
              <li key={n} className="flex gap-3 border-b border-hairline px-4 py-3 text-sm leading-relaxed">
                <i className={cn('mt-1.5 size-2 shrink-0', MARK[i.tone])} aria-hidden />
                <span>{i.text}</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-sm text-muted-foreground">Close a few trades to get readouts.</li>
          )}
        </ol>
      ) : (
        <AiView query={ai} onRetry={ask} />
      )}

      <p className="px-4 pt-3 text-xs text-pretty text-muted-foreground">
        {view === 'Gemini'
          ? 'Gemini read the stats above (never your keys or orders). It reviews your process; it does not call trades.'
          : configured
            ? 'Computed from your history by fixed rules. Gemini can read the same stats when you ask.'
            : 'Computed from your history by fixed rules. AI answers arrive once Gemini is set up on the server.'}
      </p>
      <form className="flex gap-2 p-4" onSubmit={(e) => e.preventDefault()}>
        <Input placeholder="Ask about your trades…" disabled aria-label="Ask about your trades (coming soon)" />
        <Button size="icon" disabled aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </div>
  )
}

function AiView({ query, onRetry }: { query: UseQueryResult<InsightsResult>; onRetry: () => void }) {
  if (query.isFetching)
    return (
      <p aria-busy className="flex flex-1 items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Gemini is reading your stats…
      </p>
    )
  if (query.isError)
    return (
      <div className="flex-1 px-4 py-6 text-sm">
        <p>{query.error.message}</p>
        <Button variant="outline" size="xs" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  const r = query.data
  if (!r) return null
  if (r.status === 'empty')
    return (
      <p className="flex-1 px-4 py-6 text-sm text-muted-foreground">
        {r.trades} closed {r.trades === 1 ? 'trade' : 'trades'} in this range; Gemini needs at least 5 to say anything.
      </p>
    )
  if (r.status === 'review')
    return (
      <div className="flex-1 px-4 py-6 text-sm">
        <p className="font-medium">Not shown: the answer could not be checked</p>
        <p className="mt-1 text-muted-foreground">{r.reason} Rather than guess, crypz leaves it out.</p>
        <Button variant="outline" size="xs" className="mt-3" onClick={onRetry}>
          Ask again
        </Button>
      </div>
    )
  return (
    <div className="flex flex-1 flex-col">
      <ol className="flex flex-col">
        {r.insights.map((i, n) => (
          <li key={n} className="flex gap-3 border-b border-hairline px-4 py-3 text-sm leading-relaxed">
            <i className={cn('mt-1.5 size-2 shrink-0', MARK[i.tone])} aria-hidden />
            <div className="flex min-w-0 flex-col gap-1.5">
              <p>{i.finding}</p>
              {i.evidence.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {i.evidence.map((e, k) => (
                    <li key={k} className="num text-xs text-muted-foreground">
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              {i.change && (
                <p>
                  <span className="label">Try</span> {i.change}
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 num text-[11px] text-muted-foreground">
                <span title="Low under 15 trades behind it, medium 15–39, high 40+">
                  {i.confidence} confidence · {i.basis} trades
                </span>
                <span
                  className={cn('flex items-center gap-1.5', !i.checked && 'text-foreground')}
                  title={
                    i.checked
                      ? 'Every figure it cites is in your stats'
                      : 'A figure it cites is not in your stats; read this one with care'
                  }
                >
                  <i
                    aria-hidden
                    className={cn(
                      'size-1.5',
                      i.checked ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]',
                    )}
                  />
                  {i.checked ? 'figures checked' : 'figure not found'}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {r.missing.length > 0 && (
        <p className="px-4 pt-3 text-xs text-pretty text-muted-foreground">
          <span className="label">Would need</span> {r.missing.join('; ')}
        </p>
      )}
      <p className="px-4 pt-2 num text-[11px] text-muted-foreground">
        {r.model} · {r.trades} trades ·{' '}
        {new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  )
}

