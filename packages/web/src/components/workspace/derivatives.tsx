import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LONG_SHORT_KINDS, STAT_BARS, type LongShortKind } from '@crypz/exchanges'
import { fmtNum, fmtPrice, fmtSigned, fmtSize, fmtUsd, signedUsd, tone } from '@/lib/format'
import { MARKET_EXCHANGE } from '@/lib/market'
import {
  latestCandlesQuery,
  liquidationsQuery,
  longShortQuery,
  openInterestQuery,
  premiumQuery,
  takerFlowQuery,
} from '@/lib/queries'
import { useFunding, useIndexPrice, useLiquidationFeed, useTicker } from '@/lib/okx-ws'
import { cn } from '@/lib/utils'
import { IndicatorChart, Readout, within, type Bar } from './indicator-chart'
import { SplitBar, StripControl, Waiting, clockTime, eventTime, p90, periodLabel, pick } from './kit'
import type { WidgetProps } from './widgets'

// Derivatives positioning: who is in (open interest), which way the crowd leans (long/short), who is aggressing
// (taker flow), how far the perpetual trades from spot (basis), and who is being forced out (liquidations).
// Statistics are ink lines; their per-period changes and the two sides of a split carry up/down.

const periodOf = (settings: WidgetProps['settings']) => pick(settings.period, STAT_BARS, '15m')

/** Shown over a chart until its statistic arrives. */
const Pending = ({ error, what }: { error: boolean; what: string }) => (
  <div className="absolute inset-0 z-10 bg-background">
    <Waiting what={error ? `Could not load ${what}. Retrying…` : undefined} />
  </div>
)

/** The hovered row, or the newest when nothing is hovered. */
const rowAt = <T extends { time: number }>(rows: T[], hovered: number | null) =>
  (hovered !== null ? rows.find((r) => r.time === hovered) : null) ?? rows.at(-1)

// ---- open interest -------------------------------------------------------------------------------------------

export function OpenInterestBody({ symbol, settings }: WidgetProps) {
  const period = periodOf(settings)
  const oi = useQuery(openInterestQuery(MARKET_EXCHANGE, symbol, period))
  const latest = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, period))
  const [hovered, setHovered] = useState<number | null>(null)

  const rows = useMemo(
    () => (oi.data ?? []).map((r, i, all) => ({ ...r, change: i ? r.usd - all[i - 1].usd : 0 })),
    [oi.data],
  )
  const series = useMemo(
    () => ({
      candles: within(latest.data, rows[0]?.time),
      line: rows.map((r) => ({ time: r.time, value: r.usd })),
      bars: [rows.map((r): Bar => ({ time: r.time, value: r.change, tone: r.change >= 0 ? 'up' : 'down' }))],
    }),
    [latest.data, rows],
  )
  const row = rowAt(rows, hovered)
  const first = rows[0]

  return (
    <IndicatorChart frameKey={`${symbol}:${period}`} bar={period} {...series} onHover={setHovered}>
      {row && (
        <Readout>
          <span>{periodLabel(row.time, period)}</span>
          <span>
            OI <span className="text-foreground">{fmtUsd(row.usd)}</span>
          </span>
          <span>
            Δ <span className={tone(row.change)}>{signedUsd(row.change)}</span>
          </span>
          {first && (
            <span title="Change across the window shown">
              Window{' '}
              <span className={tone(row.usd - first.usd)}>{fmtSigned(((row.usd - first.usd) / first.usd) * 100)}%</span>
            </span>
          )}
          <span>
            <span className="text-foreground">{fmtSize(row.contracts)}</span> cont
          </span>
        </Readout>
      )}
      {!rows.length && <Pending error={oi.isError} what="open interest" />}
    </IndicatorChart>
  )
}

// ---- long/short ratio ----------------------------------------------------------------------------------------

const KIND_LABEL: Record<LongShortKind, string> = {
  accounts: 'All accounts',
  'top-accounts': 'Top traders',
  'top-positions': 'Top positions',
}
const KIND_HINT: Record<LongShortKind, string> = {
  accounts: 'Accounts net long ÷ accounts net short, across everyone',
  'top-accounts': 'The same, among the top 5% of traders by margin',
  'top-positions': 'Long size ÷ short size held by the top 5% of traders',
}

export function LongShortBody({ symbol, settings, set }: WidgetProps) {
  const period = periodOf(settings)
  const kind = pick(settings.kind, LONG_SHORT_KINDS, 'accounts')
  const ls = useQuery(longShortQuery(MARKET_EXCHANGE, symbol, period, kind))
  const latest = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, period))
  const [hovered, setHovered] = useState<number | null>(null)

  const rows = ls.data ?? []
  const series = useMemo(
    () => ({
      candles: within(latest.data, ls.data?.[0]?.time),
      line: (ls.data ?? []).map((r) => ({ time: r.time, value: r.ratio })),
    }),
    [latest.data, ls.data],
  )
  const row = rowAt(rows, hovered)
  const long = row ? (row.ratio / (1 + row.ratio)) * 100 : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StripControl
        text="Ratio of"
        hint={KIND_HINT[kind]}
        label="Whose positioning"
        options={LONG_SHORT_KINDS}
        value={kind}
        onChange={(k) => set({ kind: k })}
        format={(k) => KIND_LABEL[k]}
      />
      <div className="min-h-0 flex-1">
        <IndicatorChart
          frameKey={`${symbol}:${period}:${kind}`}
          bar={period}
          {...series}
          lineFormat="ratio"
          baseline={1}
          onHover={setHovered}
        >
          {row && (
            <Readout>
              <span>{periodLabel(row.time, period)}</span>
              <span>
                L/S <span className="text-foreground">{fmtNum(row.ratio, 2)}</span>
              </span>
              {/* the split is a lean of the crowd, not a result: up/down only mark the two sides */}
              <span className="text-up">Long {fmtNum(long, 1)}%</span>
              <span className="text-down">Short {fmtNum(100 - long, 1)}%</span>
            </Readout>
          )}
          {!rows.length && <Pending error={ls.isError} what="the long/short ratio" />}
        </IndicatorChart>
      </div>
    </div>
  )
}

// ---- taker buy/sell ------------------------------------------------------------------------------------------

export function TakerBody({ symbol, settings }: WidgetProps) {
  const period = periodOf(settings)
  const flow = useQuery(takerFlowQuery(MARKET_EXCHANGE, symbol, period))
  const latest = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, period))
  const [hovered, setHovered] = useState<number | null>(null)

  const rows = useMemo(
    () => (flow.data ?? []).map((f) => ({ ...f, share: (f.buy / (f.buy + f.sell || 1)) * 100 })),
    [flow.data],
  )
  const series = useMemo(
    () => ({
      candles: within(latest.data, rows[0]?.time),
      line: rows.map((r) => ({ time: r.time, value: r.share })),
      // buys above the axis, sells below: the two sides of every period at a glance
      bars: [
        rows.map((r): Bar => ({ time: r.time, value: r.buy, tone: 'up' })),
        rows.map((r): Bar => ({ time: r.time, value: -r.sell, tone: 'down' })),
      ],
    }),
    [latest.data, rows],
  )
  const row = rowAt(rows, hovered)

  return (
    <IndicatorChart
      frameKey={`${symbol}:${period}`}
      bar={period}
      {...series}
      lineFormat="percent"
      percentDigits={1}
      baseline={50}
      onHover={setHovered}
    >
      {row && (
        <Readout>
          <span>{periodLabel(row.time, period)}</span>
          <span>
            Buy share <span className="text-foreground">{fmtNum(row.share, 1)}%</span>
          </span>
          <span className="text-up">Buy {fmtSize(row.buy) || '0'}</span>
          <span className="text-down">Sell {fmtSize(row.sell) || '0'}</span>
        </Readout>
      )}
      {!rows.length && <Pending error={flow.isError} what="taker volume" />}
    </IndicatorChart>
  )
}

// ---- basis ---------------------------------------------------------------------------------------------------

// The perpetual's premium over its spot index, about a point a minute for the last hour and a half, under 1m price.
// Premium is what funding is computed from, so the next rate sits beside it. Both are shown neutral: whether a
// premium helps depends on the side held.

export function BasisBody({ symbol }: WidgetProps) {
  const premium = useQuery(premiumQuery(MARKET_EXCHANGE, symbol))
  const latest = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, '1m'))
  const tick = useTicker(symbol)
  const index = useIndexPrice(symbol)
  const funding = useFunding(symbol)
  const [hovered, setHovered] = useState<number | null>(null)

  const rows = premium.data ?? []
  const series = useMemo(
    () => ({
      candles: within(latest.data, premium.data?.[0]?.time),
      line: (premium.data ?? []).map((r) => ({ time: r.time, value: r.premium * 100 })),
    }),
    [latest.data, premium.data],
  )
  const row = rowAt(rows, hovered)
  const last = tick ? Number(tick.last) : 0
  const idx = index ? Number(index) : 0
  const now = last && idx ? ((last - idx) / idx) * 100 : null
  const rate = funding ? Number(funding.fundingRate) * 100 : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <dl className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-hairline px-2 py-1 num text-[11px]">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Last − index</dt>
          <dd>{now === null ? '–' : `${fmtSigned(now, 3)}%`}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Index</dt>
          <dd>{idx ? fmtPrice(idx) : '–'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Funding</dt>
          <dd>{rate === null ? '–' : `${fmtSigned(rate, 4)}%`}</dd>
        </div>
      </dl>
      <div className="min-h-0 flex-1">
        <IndicatorChart
          frameKey={symbol}
          bar="1m"
          {...series}
          lineFormat="percent"
          percentDigits={3}
          baseline={0}
          onHover={setHovered}
        >
          {row && (
            <Readout>
              <span>{clockTime(row.time)}</span>
              <span>
                Premium <span className="text-foreground">{fmtSigned(row.premium * 100, 4)}%</span>
              </span>
            </Readout>
          )}
          {!rows.length && <Pending error={premium.isError} what="the premium history" />}
        </IndicatorChart>
      </div>
    </div>
  )
}

// ---- liquidations --------------------------------------------------------------------------------------------

// Forced closes: the newest 100 from the exchange, then live ones as they happen. A long being liquidated is a
// forced sell, so it takes the down colour; a short is a forced buy and takes up. Sizes are USD notional.

export function LiquidationsBody({ symbol }: WidgetProps) {
  const history = useQuery(liquidationsQuery(MARKET_EXCHANGE, symbol))
  const feed = useLiquidationFeed()
  const ct = history.data?.contractValue ?? 0

  const events = useMemo(() => {
    const seen = new Set<string>()
    const out: { time: number; side: 'long' | 'short'; price: number; usd: number }[] = []
    const live = feed.filter((e) => e.instId === symbol)
    for (const e of [...live, ...(history.data?.events ?? [])]) {
      const key = `${e.time}:${e.side}:${e.price}:${e.size}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ time: e.time, side: e.side, price: e.price, usd: e.size * ct * e.price })
    }
    return out.sort((a, b) => b.time - a.time)
  }, [feed, history.data, symbol, ct])

  // the biggest tenth of what is listed gets weight, like the trades tape
  const big = useMemo(() => p90(events.map((e) => e.usd)), [events])

  if (!history.data && !events.length)
    return <Waiting what={history.isError ? 'Could not load liquidations. Retrying…' : undefined} />
  if (!events.length) return <Waiting what="No liquidations yet" />

  const longs = events.reduce((s, e) => s + (e.side === 'long' ? e.usd : 0), 0)
  const shorts = events.reduce((s, e) => s + (e.side === 'short' ? e.usd : 0), 0)
  const longShare = longs / (longs + shorts || 1)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-[1fr_1.4fr_1fr_1fr] px-2 py-1 label">
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {events.map((e) => (
          <li
            key={`${e.time}:${e.side}:${e.price}:${e.usd}`}
            className={cn(
              'grid h-[18px] grid-cols-[1fr_1.4fr_1fr_1fr] items-center px-2 num text-[11px]',
              e.usd >= big && 'font-semibold',
            )}
          >
            <span className={e.side === 'long' ? 'text-down' : 'text-up'}>{e.side === 'long' ? 'Long' : 'Short'}</span>
            <span className="text-right">{fmtPrice(e.price)}</span>
            <span className="text-right">{fmtUsd(e.usd)}</span>
            <span className="text-right text-muted-foreground">{eventTime(e.time)}</span>
          </li>
        ))}
      </ol>
      <div
        className="flex shrink-0 flex-col gap-1 border-t border-hairline px-2 py-1.5"
        title={`${events.length} liquidations since ${clockTime(events.at(-1)!.time)}`}
      >
        <div className="flex justify-between num text-[11px]">
          <span className="text-down">Longs {fmtUsd(longs)}</span>
          <span className="text-muted-foreground">since {clockTime(events.at(-1)!.time)}</span>
          <span className="text-up">Shorts {fmtUsd(shorts)}</span>
        </div>
        <SplitBar share={longShare} fill="down" />
      </div>
    </div>
  )
}
