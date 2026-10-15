import { ArrowUp } from 'lucide-react'
import type { Insight } from '@crypz/exchanges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const MARK: Record<Insight['tone'], string> = {
  leak: 'shadow-[inset_0_0_0_1px_var(--foreground)]',
  edge: 'bg-foreground',
  note: 'bg-muted-foreground/40',
}

/** Rule-based readouts today; the Gemini + RAG layer replaces the source later. */
export function Insights({ insights, scope }: { insights: Insight[]; scope?: string | null }) {
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
        <Badge variant="outline" className="num font-normal text-muted-foreground">
          Gemini · not connected
        </Badge>
      </div>
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
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Computed from your history by fixed rules. AI answers arrive with the Gemini integration.
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
