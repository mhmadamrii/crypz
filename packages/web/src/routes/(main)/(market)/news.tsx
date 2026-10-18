import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, X } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { newsQuery, usePortfolio } from '@/lib/queries'
import { searchText } from '@/lib/search'
import { cn } from '@/lib/utils'

// Market news: headlines from publisher feeds, newest first, by day. The page reads like the position ledger: one
// ruled row per story, the time in mono, the source as a label, the headline linking out to the publisher. Coins
// the story names are chips; a coin you have traded is an inverted chip and marks its row with a filled square, so
// what touches your book stands out without reordering the tape. Filters live in the URL, like the asset focus.

type Search = { source?: string; coin?: string; mine?: boolean }

export const Route = createFileRoute('/(main)/(market)/news')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    source: searchText(s.source),
    coin: searchText(s.coin)?.toUpperCase(),
    mine: s.mine === true || s.mine === '1' || s.mine === 1 ? true : undefined,
  }),
  head: () => ({ meta: [{ title: 'News · crypz' }] }),
  component: News,
})

type Item = {
  id: string
  title: string
  url: string
  source: string
  publishedAt: number
  summary: string
  coins: string[]
}

const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fullDate = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

function dayLabel(ms: number) {
  const d = new Date(ms)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  if (d.toDateString() === today.toDateString()) return `Today · ${date}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${date}`
  return date
}

function News() {
  const q = useQuery(newsQuery())
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const set = (patch: Search) => navigate({ search: (s) => ({ ...s, ...patch }), replace: true })

  // the coins you have traded, from your position history
  const { positions } = usePortfolio()
  const mine = useMemo(() => new Set(positions.map((p) => p.symbol.split('-')[0])), [positions])

  const items = (q.data?.items ?? []) as Item[]
  const sources = q.data?.sources ?? []
  const shown = items.filter(
    (i) =>
      (!search.source || i.source === search.source) &&
      (!search.coin || i.coins.includes(search.coin)) &&
      (!search.mine || i.coins.some((c) => mine.has(c))),
  )
  const coinCounts = useMemo(() => {
    const n = new Map<string, number>()
    for (const i of items) for (const c of i.coins) n.set(c, (n.get(c) ?? 0) + 1)
    // your coins first, then by how often they are in the news
    return [...n].sort((a, b) => Number(mine.has(b[0])) - Number(mine.has(a[0])) || b[1] - a[1])
  }, [items, mine])
  const days = useMemo(() => {
    const out: { label: string; items: Item[] }[] = []
    for (const i of shown) {
      const label = dayLabel(i.publishedAt)
      if (out.at(-1)?.label === label) out.at(-1)!.items.push(i)
      else out.push({ label, items: [i] })
    }
    return out
  }, [shown])
  const filtered = !!(search.source || search.coin || search.mine)
  const fetchedAt = Math.max(0, ...sources.map((s) => s.fetchedAt ?? 0))

  const filters = (
    <Filters sources={sources} coins={coinCounts} mine={mine} search={search} set={set} total={items.length} />
  )

  return (
    <>
      <PageHeader title="News" source="4 publishers">
        {fetchedAt > 0 && (
          <span className="hidden label sm:inline" title="Feeds are checked every few minutes">
            Updated {time(fetchedAt)}
          </span>
        )}
      </PageHeader>
      <main className="grid grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12">
        {/* phones: filters above the list, as one scrolling row of chips */}
        <div className="min-w-0 lg:hidden">{filters}</div>
        <section aria-label="Headlines" className="min-w-0">
          {q.isPending ? (
            <ListSkeleton />
          ) : q.isError ? (
            <div className="border border-border p-6">
              <p className="font-medium">Could not load the news</p>
              <p className="mt-1 text-sm text-muted-foreground">{q.error.message}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => q.refetch()}>
                Try again
              </Button>
            </div>
          ) : !shown.length ? (
            <div className="border border-dashed border-border p-8 text-center">
              <p className="font-medium">{filtered ? 'No headlines match these filters' : 'No headlines yet'}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtered
                  ? `Nothing in the latest ${items.length} stories${search.coin ? ` names ${search.coin}` : ''}${search.mine ? ' or a coin you have traded' : ''}.`
                  : 'The feeds returned nothing. They are checked again in a few minutes.'}
              </p>
              {filtered && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => set({ source: undefined, coin: undefined, mine: undefined })}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {days.map((d) => (
                <section key={d.label} aria-label={d.label}>
                  <h2 className="flex items-baseline justify-between border-b border-border pb-2 label">
                    <span>{d.label}</span>
                    <span>{d.items.length}</span>
                  </h2>
                  <ol>
                    {d.items.map((i) => (
                      <Row key={i.id} item={i} mine={mine} onCoin={(c) => set({ coin: c })} />
                    ))}
                  </ol>
                </section>
              ))}
              <p className="text-xs text-muted-foreground">
                Headlines and summaries from each publisher’s RSS feed; stories open on their site.
              </p>
            </div>
          )}
        </section>
        <aside className="hidden lg:block">
          <div className="sticky top-24">{filters}</div>
        </aside>
      </main>
    </>
  )
}

function Row({ item, mine, onCoin }: { item: Item; mine: Set<string>; onCoin: (c: string) => void }) {
  const yours = item.coins.some((c) => mine.has(c))
  return (
    <li className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-b border-hairline py-4 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
      <time
        dateTime={new Date(item.publishedAt).toISOString()}
        title={fullDate(item.publishedAt)}
        className="pt-0.5 num text-[13px] text-muted-foreground"
      >
        {time(item.publishedAt)}
      </time>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {yours && <i aria-label="Names a coin you trade" className="size-1.5 shrink-0 bg-foreground" />}
          <span className="label">{item.source}</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-1 block text-base leading-snug font-medium tracking-[-0.015em] text-pretty underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {item.title}
          <ArrowUpRight
            aria-hidden
            className="ml-1 inline size-3.5 -translate-y-px text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
          <span className="sr-only"> (opens {item.source})</span>
        </a>
        {item.summary && <p className="mt-1 line-clamp-2 text-sm text-pretty text-muted-foreground">{item.summary}</p>}
        {item.coins.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.coins.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onCoin(c)}
                title={mine.has(c) ? `${c} · you trade it. Show only ${c} news` : `Show only ${c} news`}
                className={cn(
                  'h-5 px-1.5 num text-[11px]',
                  mine.has(c)
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

type Source = { name: string; ok: boolean; count: number; fetchedAt: number | null }

function Filters({
  sources,
  coins,
  mine,
  search,
  set,
  total,
}: {
  sources: Source[]
  coins: [string, number][]
  mine: Set<string>
  search: Search
  set: (patch: Search) => void
  total: number
}) {
  const option = (active: boolean) =>
    cn(
      'flex h-8 shrink-0 items-center gap-2 px-2.5 text-sm whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 lg:w-full',
      active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="min-w-0">
        <legend className="mb-2 label">Show</legend>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          <button
            type="button"
            aria-pressed={!search.mine}
            className={option(!search.mine)}
            onClick={() => set({ mine: undefined })}
          >
            All stories <span className="ml-auto num text-[11px]">{total}</span>
          </button>
          <button
            type="button"
            aria-pressed={!!search.mine}
            className={option(!!search.mine)}
            onClick={() => set({ mine: true })}
            disabled={!mine.size}
            title={mine.size ? undefined : 'No position history yet to tell which coins you trade'}
          >
            <i aria-hidden className="size-1.5 bg-foreground" /> Coins you trade
          </button>
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 label">Source</legend>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          <button
            type="button"
            aria-pressed={!search.source}
            className={option(!search.source)}
            onClick={() => set({ source: undefined })}
          >
            All publishers
          </button>
          {sources.map((s) => (
            <button
              key={s.name}
              type="button"
              aria-pressed={search.source === s.name}
              className={option(search.source === s.name)}
              onClick={() => set({ source: search.source === s.name ? undefined : s.name })}
              title={
                s.ok
                  ? undefined
                  : `Could not reach ${s.name} on the last check${s.fetchedAt ? `; showing stories from ${time(s.fetchedAt)}` : ''}`
              }
            >
              {/* filled: the feed answered on the last check; hollow: it did not */}
              <i
                aria-hidden
                className={cn(
                  'size-1.5 shrink-0',
                  s.ok ? 'bg-foreground' : 'shadow-[inset_0_0_0_1px_var(--foreground)]',
                )}
              />
              {s.name}
              <span className="ml-auto num text-[11px]">{s.ok ? s.count : 'stale'}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {coins.length > 0 && (
        <fieldset className="min-w-0">
          <legend className="mb-2 flex w-full items-center justify-between label">
            Coins
            {search.coin && (
              <button
                type="button"
                onClick={() => set({ coin: undefined })}
                className="flex items-center gap-1 normal-case hover:text-foreground"
              >
                <X className="size-3" /> {search.coin}
              </button>
            )}
          </legend>
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-wrap">
            {coins.map(([c, n]) => (
              <button
                key={c}
                type="button"
                aria-pressed={search.coin === c}
                onClick={() => set({ coin: search.coin === c ? undefined : c })}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 px-2 num text-[11px]',
                  search.coin === c
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground',
                )}
              >
                {mine.has(c) && (
                  <i aria-hidden className={cn('size-1.5', search.coin === c ? 'bg-background' : 'bg-foreground')} />
                )}
                {c}
                <span className={search.coin === c ? '' : 'text-muted-foreground'}>{n}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading headlines" className="flex flex-col">
      <Skeleton className="mb-2 h-4 w-40" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 border-b border-hairline py-4">
          <Skeleton className="h-4 w-10" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
