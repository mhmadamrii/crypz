import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DayState } from './use-footprint-history'

// Where the replay footprint's history stands, bottom-left over the chart, only while there is something to say:
// a day being built from OKX's trade file, one OKX has not published yet, or one that failed (with a retry). The
// square follows the status pill: hollow while waiting, toned down on a failure. Silent once every day is ready.

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export function FootprintStatus({
  blocked,
  states,
  onRetry,
}: {
  blocked: string | null
  states: DayState[]
  onRetry: (day: string) => Promise<void>
}) {
  const [retrying, setRetrying] = useState<string | null>(null)
  const lines: { key: string; text: string; failed?: boolean; retry?: string }[] = []
  if (blocked) lines.push({ key: 'blocked', text: blocked })
  for (const s of states) {
    if (s.status === 'pending') lines.push({ key: s.day, text: `Building ${dayLabel(s.day)} from OKX trades…` })
    else if (s.status === 'unpublished')
      lines.push({ key: s.day, text: `OKX publishes ${dayLabel(s.day)} trades around ${clock(s.at)}` })
    else if (s.status === 'failed') lines.push({ key: s.day, text: s.error, failed: true, retry: s.day })
  }
  if (!lines.length) return null

  return (
    <section
      aria-label="Footprint history"
      aria-live="polite"
      className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-1 border border-border bg-background/90 px-2.5 py-1.5 num text-[11px] text-muted-foreground"
    >
      {lines.map((l) => (
        <p key={l.key} className="flex items-center gap-2">
          <i
            aria-hidden
            className={cn('size-2 shrink-0 shadow-[inset_0_0_0_1px_currentColor]', l.failed && 'text-down')}
          />
          <span className={cn('min-w-0', l.failed && 'text-foreground')}>
            <span className="text-foreground">Footprint</span> · {l.text}
          </span>
          {l.retry && (
            <button
              type="button"
              disabled={retrying === l.retry}
              onClick={async () => {
                setRetrying(l.retry!)
                // a retry that cannot reach the api leaves the day as it was: still failed, still retryable
                await onRetry(l.retry!).catch(() => {})
                setRetrying(null)
              }}
              className="shrink-0 px-1 text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-1 focus-visible:outline-foreground disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </p>
      ))}
    </section>
  )
}
