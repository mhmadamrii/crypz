import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Segmented } from '@/components/segmented'
import { bookState, summarize, valueOf, type BookState, type Metric, type Ranked, type Summary } from '@/lib/book'
import { fmtPrice, fmtSigned, fmtSize, fmtUsd, tone } from '@/lib/format'
import { BOOK_GROUPS, BOOK_RANGES } from '@/lib/indicators/store'
import { useBook, useConnection, useTicker } from '@/lib/okx-ws'
import { instrumentQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { SplitBar, StripControl, Waiting, pick, useNow } from './kit'
import type { WidgetProps } from './widgets'

// OKX liquidity: how much size is resting in the live order book either side of the market, and where the biggest
// levels sit. Depth is measured over the same band either side of the price (±1% by default), so the two sides
// compare. It is resting size, which can be pulled at any moment, not traded volume, and it says nothing about where
// price goes next. Only a live, current book is ever shown as numbers; every other state says what is wrong.

const METRICS = ['notional', 'base'] as const
const RANGES = BOOK_RANGES
const TOP = 5

const STATE: Record<BookState, string> = {
  live: 'Live',
  loading: 'Loading',
  disconnected: 'Offline',
  stale: 'Stale',
}

const age = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`
}

export type LiquidityViewProps = {
  symbol: string
  state: BookState
  /** Why there is no book to show: OKX refused the instrument, or its spec would not load. */
  error: string | null
  /** Null while there is nothing to measure: not live, or a side of the book is empty. */
  summary: Summary | null
  /** What the distances are measured from. */
  refKind: 'last' | 'mid'
  metric: Metric
  range: number
  /** When the book last heard from OKX, and the time now, both in ms. */
  at: number
  now: number
}

/** Rendering only, so every state can be shown (and tested) without a connection. */
export function LiquidityView({ symbol, state, error, summary, refKind, metric, range, at, now }: LiquidityViewProps) {
  const coin = symbol.split('-')[0]
  const show = (v: { base: number; notional: number }) =>
    metric === 'notional' ? fmtUsd(v.notional) : `${fmtSize(v.base) || '0'} ${coin}`
  const pct = `±${+(range * 100).toFixed(1)}%`
  const live = state === 'live' && !error
  const heard = at ? `${age(now - at)} ago` : 'no update yet'

  const message = error
    ? error
    : state === 'loading'
      ? 'Waiting for the OKX order book…'
      : state === 'disconnected'
        ? `Offline. Reconnecting; the last book (${heard}) is hidden.`
        : state === 'stale'
          ? `No update for ${age(now - at)}. The last book is hidden.`
          : !summary
            ? 'The book is empty on one side: nothing to measure from.'
            : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="status"
        className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 py-1 num text-[11px]"
      >
        <span className="flex items-center gap-1.5">
          <i
            aria-hidden
            className="size-2"
            style={live ? { backgroundColor: 'var(--up)' } : { boxShadow: 'inset 0 0 0 1px var(--muted-foreground)' }}
          />
          <span className={live ? 'text-foreground' : 'text-muted-foreground'}>{error ? 'Error' : STATE[state]}</span>
        </span>
        <span className="text-muted-foreground" title="When OKX last sent anything about this book">
          {live ? `updated ${heard}` : `OKX · ${symbol}`}
        </span>
      </div>
      {message || !summary ? (
        <Waiting what={message ?? undefined} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
          <div className="flex items-baseline justify-between num text-[11px]">
            <span className="text-muted-foreground">
              {refKind === 'last' ? 'Last' : 'Mid'} <span className="text-foreground">{fmtPrice(summary.ref)}</span>
            </span>
            <span className="text-muted-foreground" title="Both sides are measured over the same band around the price">
              within {pct}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <dt className="label" title="Resting buy orders from the price down to the bottom of the band">
                Bids
              </dt>
              <dd className="num text-sm text-up">{show(summary.bid)}</dd>
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <dt className="label" title="Resting sell orders from the price up to the top of the band">
                Asks
              </dt>
              <dd className="num text-sm text-down">{show(summary.ask)}</dd>
            </div>
          </dl>
          {summary.imbalance !== null && (
            <SplitBar share={(summary.imbalance + 1) / 2} fill="up" className="h-1 shrink-0" />
          )}
          <div
            className="flex items-baseline justify-between num text-[11px]"
            title="(bids − asks) ÷ (bids + asks) over the band: +100% is all bids, −100% all asks. Resting size, not a forecast."
          >
            <span className="label">Imbalance</span>
            {summary.imbalance === null ? (
              <span className="text-muted-foreground">no size in range</span>
            ) : (
              <span className={tone(summary.imbalance)}>
                {fmtSigned(summary.imbalance * 100, 0)}%{' '}
                <span className="text-muted-foreground">
                  {summary.imbalance > 0 ? 'bids' : summary.imbalance < 0 ? 'asks' : 'even'}
                </span>
              </span>
            )}
          </div>

          <Levels title="Largest bids" levels={summary.bids} metric={metric} coin={coin} side="bid" />
          <Levels title="Largest asks" levels={summary.asks} metric={metric} coin={coin} side="ask" />
        </div>
      )}
    </div>
  )
}

function Levels({
  title,
  levels,
  metric,
  coin,
  side,
}: {
  title: string
  levels: Ranked[]
  metric: Metric
  coin: string
  side: 'bid' | 'ask'
}) {
  return (
    <section aria-label={title} className="flex flex-col">
      <h4 className="label" title="Price buckets of the chosen grouping, ranked by the chosen measure">
        {title}
      </h4>
      {levels.length ? (
        <ol>
          {levels.map((l) => (
            <li key={l.px} className="grid h-[18px] grid-cols-3 items-center num text-[11px]">
              <span className={side === 'bid' ? 'text-up' : 'text-down'}>{fmtPrice(l.px)}</span>
              <span className="text-right">
                {metric === 'notional' ? fmtUsd(valueOf(l, metric)) : `${fmtSize(l.base) || '0'} ${coin}`}
              </span>
              <span className="text-right text-muted-foreground" title="Distance from the price">
                {fmtSigned(l.pct * 100, 2)}%
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="num text-[11px] text-muted-foreground">None in range</p>
      )}
    </section>
  )
}

export function LiquidityBody({ symbol, settings, set }: WidgetProps) {
  const book = useBook(symbol)
  const conn = useConnection()
  const now = useNow()
  const spec = useQuery(instrumentQuery(symbol))
  const last = useTicker(symbol)
  const metric = pick(settings.metric, METRICS, 'notional')
  const range = pick(settings.range, RANGES, 0.01)
  const group = pick(settings.group, BOOK_GROUPS, 1)

  const state = bookState(book, conn, now)
  const price = last ? Number(last.last) : null
  const ref = price !== null && Number.isFinite(price) && price > 0 ? price : null
  const error = book.error
    ? `OKX refused ${symbol}: ${book.error}`
    : spec.isError
      ? `Could not load the ${symbol} spec: ${spec.error.message}`
      : null

  const summary = useMemo(
    () =>
      state === 'live' && spec.data
        ? summarize(book.bids, book.asks, spec.data, { ref, range, metric, group, top: TOP })
        : null,
    [state, spec.data, book, ref, range, metric, group],
  )
  // the spec is part of "live": a book that cannot be sized is still loading, not empty
  const shown: BookState = state === 'live' && !spec.data && !error ? 'loading' : state

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StripControl
        text="Rank by"
        label="Measure"
        options={METRICS}
        value={metric}
        onChange={(m) => set({ metric: m })}
        format={(m) => (m === 'notional' ? 'USD' : symbol.split('-')[0])}
      />
      <StripControl
        text="Group"
        label="Price grouping of the largest levels"
        options={BOOK_GROUPS}
        value={group}
        onChange={(g) => set({ group: g })}
        format={(g) => (g ? `${10 ** g}×` : 'Fine')}
      />
      <LiquidityView
        symbol={symbol}
        state={shown}
        error={error}
        summary={summary}
        refKind={ref === null ? 'mid' : 'last'}
        metric={metric}
        range={range}
        at={book.at}
        now={now}
      />
      <p className={cn('shrink-0 border-t border-hairline px-2 py-1.5 text-[11px] text-muted-foreground')}>
        Resting orders in OKX’s live book, not traded volume. No prediction.
      </p>
    </div>
  )
}

export function LiquidityControls({ settings, set }: WidgetProps) {
  return (
    <Segmented
      label="Depth range, each side of the price"
      options={RANGES}
      value={pick(settings.range, RANGES, 0.01)}
      onChange={(range) => set({ range })}
      format={(v) => `±${+(v * 100).toFixed(1)}%`}
    />
  )
}
