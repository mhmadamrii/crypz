import { useMemo, useState, type PointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { STAT_BARS, type Candle } from '@crypz/exchanges'
import { fmtNum, fmtPrice, fmtSigned, tone } from '@/lib/format'
import { MARKET_EXCHANGE } from '@/lib/market'
import { latestCandlesQuery, takerFlowQuery } from '@/lib/queries'
import { absorptionsOf, columnsOf, imbalancesOf, rowOf, type Absorption } from '@/lib/footprint'
import { useBook, useFootprint, useTicker } from '@/lib/okx-ws'
import { cn } from '@/lib/utils'
import { IndicatorChart, Readout, within, type Bar } from './indicator-chart'
import { Segmented, Waiting, clockTime, decimalsOf, fmtSize, periodLabel, pick, signedSize, stepsFor } from './kit'
import type { WidgetProps } from './widgets'

// Order flow beyond the ladder and the tape. As everywhere in order flow, up/down colour means direction (bids and
// buying, asks and selling), not a result. Volume profile has no direction, so it is drawn in ink density alone.

/** Where a pointer sits across an element, 0..1 on each axis. */
const at = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
}

// ---- depth chart ---------------------------------------------------------------------------------------------

// OKX's book feed carries 400 levels a side, which on a liquid perp spans a few hundredths of a percent. The range is
// therefore a zoom into the depth that actually arrived (1× = out to the shallower side's last level), and the
// readout says what that is in percent.
const ZOOMS = [1, 2, 4] as const

type DepthLevel = { px: number; cum: number }

/** One side of the book out to `limit`, best level first, with the running total. */
function side(levels: Map<string, string>, kind: 'bid' | 'ask', limit: number): DepthLevel[] {
  const rows: [number, number][] = []
  for (const [p, s] of levels) {
    const px = Number(p)
    if (kind === 'bid' ? px >= limit : px <= limit) rows.push([px, Number(s)])
  }
  rows.sort((a, b) => (kind === 'bid' ? b[0] - a[0] : a[0] - b[0]))
  let cum = 0
  return rows.map(([px, sz]) => ({ px, cum: (cum += sz) }))
}

/** The cumulative step outline from the best level out to the range edge, in the 1000×1000 drawing box. */
function stepLine(levels: DepthLevel[], edge: number, x: (p: number) => number, y: (c: number) => number) {
  if (!levels.length) return ''
  let d = `M${x(levels[0].px)},${y(0)}`
  let prev = 0
  for (const l of levels) {
    d += ` L${x(l.px)},${y(prev)} L${x(l.px)},${y(l.cum)}`
    prev = l.cum
  }
  return `${d} L${x(edge)},${y(prev)}`
}

/** Total resting size between the mid and `price`. */
function depthAt(levels: DepthLevel[], price: number, kind: 'bid' | 'ask') {
  let cum = 0
  for (const l of levels) {
    if (kind === 'bid' ? l.px < price : l.px > price) break
    cum = l.cum
  }
  return cum
}

export function DepthBody({ symbol, settings }: WidgetProps) {
  const book = useBook(symbol)
  const zoom = pick(settings.zoom, ZOOMS, 1)
  const [hover, setHover] = useState<number | null>(null)

  const view = useMemo(() => {
    let bestBid = 0
    let lowBid = Infinity
    let bestAsk = Infinity
    let highAsk = 0
    for (const p of book.bids.keys()) {
      bestBid = Math.max(bestBid, Number(p))
      lowBid = Math.min(lowBid, Number(p))
    }
    for (const p of book.asks.keys()) {
      bestAsk = Math.min(bestAsk, Number(p))
      highAsk = Math.max(highAsk, Number(p))
    }
    if (!bestBid || bestAsk === Infinity) return null
    const mid = (bestBid + bestAsk) / 2
    // symmetric about the mid, so equal distances compare; the shallower side sets how far the data reaches
    const half = Math.min(mid - lowBid, highAsk - mid) / zoom
    const lo = mid - half
    const hi = mid + half
    const bids = side(book.bids, 'bid', lo)
    const asks = side(book.asks, 'ask', hi)
    const max = Math.max(bids.at(-1)?.cum ?? 0, asks.at(-1)?.cum ?? 0) || 1
    return { mid, lo, hi, bids, asks, max, pct: (half / mid) * 100 }
  }, [book, zoom])

  if (!view) return <Waiting />
  const { mid, lo, hi, bids, asks, max, pct } = view
  const x = (p: number) => ((p - lo) / (hi - lo)) * 1000
  const y = (c: number) => 1000 - (c / max) * 920
  const bidLine = stepLine(bids, lo, x, y)
  const askLine = stepLine(asks, hi, x, y)
  const bidTotal = bids.at(-1)?.cum ?? 0
  const askTotal = asks.at(-1)?.cum ?? 0

  const price = hover === null ? null : lo + hover * (hi - lo)
  const kind = price !== null && price < mid ? 'bid' : 'ask'
  const depth = price === null ? 0 : depthAt(kind === 'bid' ? bids : asks, price, kind)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-6 shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 num text-[11px]">
        {price === null ? (
          <>
            <span className="text-up">Bids {fmtSize(bidTotal)}</span>
            <span className="text-muted-foreground">±{fmtNum(pct, pct < 0.1 ? 3 : 2)}%</span>
            <span className="text-down">Asks {fmtSize(askTotal)}</span>
          </>
        ) : (
          <>
            <span>{fmtPrice(price)}</span>
            <span className="text-muted-foreground">{fmtSigned(((price - mid) / mid) * 100)}%</span>
            <span className={kind === 'bid' ? 'text-up' : 'text-down'}>Σ {fmtSize(depth) || '0'}</span>
          </>
        )}
      </div>
      <div
        className="relative min-h-0 flex-1 cursor-crosshair"
        onPointerMove={(e) => setHover(Math.min(1, Math.max(0, at(e).x)))}
        onPointerLeave={() => setHover(null)}
      >
        <svg className="absolute inset-0 size-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
          <path d={`${bidLine} L${x(lo)},${y(0)} Z`} className="fill-up/12" />
          <path d={`${askLine} L${x(hi)},${y(0)} Z`} className="fill-down/12" />
          <path d={bidLine} className="fill-none stroke-up" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={askLine} className="fill-none stroke-down" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line
            x1={500}
            x2={500}
            y1={0}
            y2={1000}
            className="stroke-border"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="pointer-events-none absolute top-1 right-2 num text-[10px] text-muted-foreground">
          {fmtSize(max)}
        </span>
        {hover !== null && (
          <>
            <i
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px border-l border-dotted border-muted-foreground"
              style={{ left: `${hover * 100}%` }}
            />
            <i
              aria-hidden
              className="pointer-events-none absolute size-[7px] -translate-1/2 bg-foreground"
              style={{ left: `${hover * 100}%`, top: `${y(depth) / 10}%` }}
            />
          </>
        )}
      </div>
      <div className="flex shrink-0 justify-between border-t border-hairline px-2 py-1 num text-[10px] text-muted-foreground">
        <span>{fmtPrice(lo)}</span>
        <span className="text-foreground">{fmtPrice(mid)}</span>
        <span>{fmtPrice(hi)}</span>
      </div>
    </div>
  )
}

export function DepthControls({ settings, set }: WidgetProps) {
  return (
    <Segmented
      label="Zoom"
      options={ZOOMS}
      value={pick(settings.zoom, ZOOMS, 1)}
      onChange={(zoom) => set({ zoom })}
      format={(z) => `${z}×`}
    />
  )
}

// ---- CVD -----------------------------------------------------------------------------------------------------

// Cumulative volume delta from the exchange's taker volume (100 periods of history), so it reads against price from
// the first paint instead of building up from when the widget opened. Price on top, CVD beneath, each period's
// delta at the bottom.

const PERIODS = STAT_BARS

export function CvdBody({ symbol, settings }: WidgetProps) {
  const period = pick(settings.period, PERIODS, '15m')
  const flow = useQuery(takerFlowQuery(MARKET_EXCHANGE, symbol, period))
  const latest = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, period))
  const [hovered, setHovered] = useState<number | null>(null)

  const rows = useMemo(() => {
    let cvd = 0
    return (flow.data ?? []).map((f) => ({ ...f, delta: f.buy - f.sell, cvd: (cvd += f.buy - f.sell) }))
  }, [flow.data])
  const series = useMemo(
    () => ({
      candles: within(latest.data, rows[0]?.time),
      line: rows.map((r) => ({ time: r.time, value: r.cvd })),
      bars: [rows.map((r): Bar => ({ time: r.time, value: r.delta, tone: r.delta >= 0 ? 'up' : 'down' }))],
    }),
    [latest.data, rows],
  )
  const row = (hovered !== null ? rows.find((r) => r.time === hovered) : null) ?? rows.at(-1)

  return (
    <IndicatorChart frameKey={`${symbol}:${period}`} bar={period} {...series} baseline={0} onHover={setHovered}>
      {row && (
        <Readout>
          <span>{periodLabel(row.time, period)}</span>
          <span>
            CVD <span className={tone(row.cvd)}>{signedSize(row.cvd)}</span>
          </span>
          <span>
            Δ <span className={tone(row.delta)}>{signedSize(row.delta)}</span>
          </span>
          <span>
            Buy <span className="text-foreground">{fmtSize(row.buy) || '0'}</span>
          </span>
          <span>
            Sell <span className="text-foreground">{fmtSize(row.sell) || '0'}</span>
          </span>
        </Readout>
      )}
      {!rows.length && (
        <div className="absolute inset-0 z-10 bg-background">
          <Waiting what={flow.isError ? 'Could not load taker volume. Retrying…' : undefined} />
        </div>
      )}
    </IndicatorChart>
  )
}

/** Period toggle for every statistics widget (CVD, open interest, long/short, taker flow). */
export function PeriodControls({ settings, set }: WidgetProps) {
  return (
    <Segmented
      label="Period"
      options={PERIODS}
      value={pick(settings.period, PERIODS, '15m')}
      onChange={(period) => set({ period })}
    />
  )
}

// ---- volume profile ------------------------------------------------------------------------------------------

// Traded volume by price over a span, from the newest 300 candles of a bar: each candle's volume is spread evenly
// over its high–low range.
// The point of control (most traded price) is solid ink, the value area (70% of volume around it) mid ink, the
// tails faint.

const SPANS = { '1D': '5m', '3D': '15m', '12D': '1H', '50D': '4H' } as const
type Span = keyof typeof SPANS
const SPAN_KEYS = Object.keys(SPANS) as Span[]
const BINS = 64

function profileOf(candles: Candle[]) {
  let lo = Infinity
  let hi = -Infinity
  for (const k of candles) {
    lo = Math.min(lo, k.low)
    hi = Math.max(hi, k.high)
  }
  const size = (hi - lo) / BINS || 1
  const vols = new Array<number>(BINS).fill(0)
  const bin = (p: number) => Math.min(BINS - 1, Math.max(0, Math.floor((p - lo) / size)))
  for (const k of candles) {
    const span = k.high - k.low
    if (span <= 0) {
      vols[bin(k.close)] += k.volume ?? 0
      continue
    }
    for (let b = bin(k.low); b <= bin(k.high); b++) {
      const overlap = Math.min(k.high, lo + (b + 1) * size) - Math.max(k.low, lo + b * size)
      if (overlap > 0) vols[b] += ((k.volume ?? 0) * overlap) / span
    }
  }
  const total = vols.reduce((s, v) => s + v, 0)
  const poc = vols.indexOf(Math.max(...vols))
  // the value area grows from the POC towards whichever neighbour traded more, until it holds 70%
  let top = poc
  let bottom = poc
  let held = vols[poc]
  while (held < total * 0.7 && (top < BINS - 1 || bottom > 0)) {
    const up = top < BINS - 1 ? vols[top + 1] : -1
    const down = bottom > 0 ? vols[bottom - 1] : -1
    if (up >= down) held += vols[++top]
    else held += vols[--bottom]
  }
  return { lo, hi, size, vols, total, poc, top, bottom, peak: vols[poc] || 1 }
}

export function ProfileBody({ symbol, settings, set }: WidgetProps) {
  const span = pick(settings.span, SPAN_KEYS, '3D')
  const candles = useQuery(latestCandlesQuery(MARKET_EXCHANGE, symbol, SPANS[span]))
  const tick = useTicker(symbol)
  const [hover, setHover] = useState<number | null>(null)
  const p = useMemo(() => (candles.data?.length ? profileOf(candles.data) : null), [candles.data])

  if (!p) return <Waiting what={candles.isError ? 'Could not load candles from OKX. Retrying…' : undefined} />
  const last = tick ? Number(tick.last) : (candles.data?.at(-1)?.close ?? 0)
  const yOf = (price: number) => Math.min(100, Math.max(0, ((p.hi - price) / (p.hi - p.lo)) * 100))
  const mid = (b: number) => p.lo + (b + 0.5) * p.size
  // rows run top (high) to bottom (low)
  const bins = Array.from({ length: BINS }, (_, i) => BINS - 1 - i)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* the span lives here, not in the header: the widget is narrow and the title has to survive */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 py-0.5">
        <span className="label">Span</span>
        <Segmented label="Span" options={SPAN_KEYS} value={span} onChange={(v) => set({ span: v })} size="strip" />
      </div>
      <div className="flex h-6 shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 num text-[11px] text-muted-foreground">
        {hover === null ? (
          <>
            <span>
              POC <span className="text-foreground">{fmtPrice(mid(p.poc))}</span>
            </span>
            <span className="truncate">
              VA {fmtPrice(p.lo + p.bottom * p.size)}–{fmtPrice(p.lo + (p.top + 1) * p.size)}
            </span>
          </>
        ) : (
          <>
            <span className="text-foreground">
              {fmtPrice(p.lo + hover * p.size)}–{fmtPrice(p.lo + (hover + 1) * p.size)}
            </span>
            <span>
              <span className="text-foreground">{fmtSize(p.vols[hover]) || '0'}</span> ·{' '}
              {fmtNum((p.vols[hover] / p.total) * 100, 1)}%
            </span>
          </>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-w-0 flex-1 flex-col py-px"
          onPointerMove={(e) => setHover(BINS - 1 - Math.min(BINS - 1, Math.floor(at(e).y * BINS)))}
          onPointerLeave={() => setHover(null)}
        >
          {bins.map((b) => (
            <div key={b} className={cn('relative min-h-0 flex-1', b === hover && 'bg-accent')}>
              <i
                aria-hidden
                className={cn(
                  'absolute inset-y-[0.5px] left-0',
                  b === p.poc ? 'bg-foreground' : b >= p.bottom && b <= p.top ? 'bg-foreground/40' : 'bg-foreground/15',
                )}
                style={{ width: `${(p.vols[b] / p.peak) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="relative w-16 shrink-0 border-l border-hairline num text-[10px] text-muted-foreground">
          <span className="absolute top-0.5 right-1.5">{fmtPrice(p.hi)}</span>
          <span className="absolute right-1.5 bottom-0.5">{fmtPrice(p.lo)}</span>
          <span
            className="absolute right-0 left-0 -translate-y-1/2 px-1.5 text-right text-foreground"
            style={{ top: `${yOf(mid(p.poc))}%` }}
          >
            {fmtPrice(mid(p.poc))}
          </span>
          {last > 0 && (
            <span
              className="absolute right-0 left-0 z-10 -translate-y-1/2 bg-foreground px-1.5 text-right text-background"
              style={{ top: `${yOf(last)}%` }}
            >
              {fmtPrice(last)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- footprint -----------------------------------------------------------------------------------------------

// Sell × buy size at each price row, per column of time, from the live trades feed. OKX offers no trade history
// to fill it backwards, so it starts when the widget opens and says so. Cell ink density is the row's volume; the
// outlined cell is the column's point of control. Reading (`lib/footprint.ts`): a diagonal imbalance sets that side
// bold in its colour, a stack of three or more adds a rail on that side's edge, and absorption outlines the row
// that held in the colour of the side resting there (bids up, asks down) and marks the column's time.

const FOOTPRINT_TF = ['1m', '5m'] as const
const ROW_STEPS = [0, 1, 2] as const
const ABSORB = [0, 2, 3, 5] as const // × the column's median row; 0 is off
const REACH = 40 // price rows each side of the last trade

export function FootprintBody({ symbol, settings, set }: WidgetProps) {
  const fp = useFootprint(symbol)
  const tf = pick(settings.tf, FOOTPRINT_TF, '1m')
  const stepIndex = pick(settings.step, ROW_STEPS, 1)
  const absorb = pick(settings.absorb, ABSORB, 3)
  // a notch coarser than the book's groupings: a footprint row has to hold two numbers
  const steps = fp.last ? stepsFor(fp.last).map((s) => s * 10) : [1, 1, 1]
  const step = steps[stepIndex]

  const view = useMemo(() => {
    if (!fp.since) return null
    const all = columnsOf(fp.minutes, tf === '1m' ? 60_000 : 300_000, step, fp.lastTs)
    const absorbed = absorb ? absorptionsOf(all, step, absorb) : new Map<number, Absorption>()
    let peak = 0
    const list = all
      .slice(-24)
      .reverse()
      .map((col) => {
        for (const [b, s] of col.cells.values()) peak = Math.max(peak, b + s)
        return { ...col, imbalances: imbalancesOf(col), absorbed: absorbed.get(col.start) }
      })
    const lastKey = rowOf(fp.last, step)
    const keys = Array.from({ length: REACH * 2 + 1 }, (_, i) => lastKey + REACH - i)
    return { list, peak: peak || 1, keys, lastKey }
  }, [fp, tf, step, absorb])

  if (!view) return <Waiting />
  const dp = decimalsOf(step)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-2 py-0.5">
        <span className="min-w-0 truncate label" title="OKX has no trade history to fill earlier columns">
          Live since {clockTime(fp.since, true)}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <div
            className="flex items-center gap-1.5"
            title="Aggressive size into a column's high or low, in multiples of its median row, that the next column did not trade past"
          >
            <span className="label">Absorb</span>
            <Segmented
              label="Absorption threshold"
              options={ABSORB}
              value={absorb}
              onChange={(a) => set({ absorb: a })}
              format={(a) => (a ? `${a}×` : 'Off')}
              size="strip"
            />
          </div>
          <Segmented
            label="Row size"
            options={ROW_STEPS}
            value={stepIndex}
            onChange={(i) => set({ step: i })}
            format={(i) => fmtNum(steps[i], decimalsOf(steps[i]))}
            size="strip"
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* newest column on the right; older ones are clipped off the left edge */}
        <div className="flex min-w-0 flex-1 flex-row-reverse overflow-hidden">
          {view.list.map((col) => {
            const abs = col.absorbed
            const absTone = abs?.side === 'bid' ? 'var(--up)' : 'var(--down)'
            return (
              <div
                key={col.start}
                className="flex w-[76px] shrink-0 flex-col border-r border-hairline first:border-r-0"
              >
                <span
                  className="flex h-5 shrink-0 items-center justify-center gap-1 border-b border-hairline num text-[10px] text-muted-foreground"
                  title={
                    abs
                      ? `${abs.side === 'bid' ? 'Bids' : 'Asks'} absorbed ${fmtSize(abs.size)} at ${fmtNum(abs.row * step, dp)}`
                      : undefined
                  }
                >
                  {abs && <i aria-hidden className={cn('size-[5px]', abs.side === 'bid' ? 'bg-up' : 'bg-down')} />}
                  {clockTime(col.start)}
                </span>
                <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
                  {view.keys.map((k) => {
                    const cell = col.cells.get(k)
                    if (!cell) return <span key={k} className="h-4 shrink-0" />
                    const [buy, sell] = cell
                    const imb = col.imbalances.get(k)
                    const held = abs?.row === k
                    return (
                      <span
                        key={k}
                        className="relative grid h-4 shrink-0 grid-cols-2 gap-1.5 px-1 num text-[10px] leading-4"
                        title={
                          held
                            ? `${abs.side === 'bid' ? 'Bids' : 'Asks'} absorbed ${fmtSize(abs.size)} here`
                            : undefined
                        }
                        style={{
                          backgroundColor: `color-mix(in oklch, var(--foreground) ${Math.round(4 + ((buy + sell) / view.peak) * 28)}%, transparent)`,
                          boxShadow: held
                            ? `inset 0 0 0 1px ${absTone}`
                            : k === col.poc
                              ? 'inset 0 0 0 1px var(--foreground)'
                              : undefined,
                        }}
                      >
                        {imb?.stacked && (
                          <i
                            aria-hidden
                            className={cn(
                              'absolute inset-y-0 w-0.5',
                              imb.side === 'buy' ? 'right-0 bg-up' : 'left-0 bg-down',
                            )}
                          />
                        )}
                        <span className={cn('text-right', imb?.side === 'sell' && 'font-semibold text-down')}>
                          {fmtSize(sell)}
                        </span>
                        <span className={cn(imb?.side === 'buy' && 'font-semibold text-up')}>{fmtSize(buy)}</span>
                      </span>
                    )
                  })}
                </div>
                <div className="flex h-8 shrink-0 flex-col justify-center border-t border-hairline text-center num text-[10px] leading-3.5">
                  <span className={tone(col.buy - col.sell)}>{signedSize(col.buy - col.sell)}</span>
                  <span className="text-muted-foreground">{fmtSize(col.buy + col.sell)}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex w-16 shrink-0 flex-col border-l border-hairline">
          <span className="h-5 shrink-0 border-b border-hairline" />
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden">
            {view.keys.map((k) => (
              <span
                key={k}
                className={cn(
                  'h-4 shrink-0 px-1.5 text-right num text-[10px] leading-4 text-muted-foreground',
                  k === view.lastKey && 'bg-foreground text-background',
                )}
              >
                {fmtNum(k * step, dp)}
              </span>
            ))}
          </div>
          <span className="h-8 shrink-0 border-t border-hairline" />
        </div>
      </div>
    </div>
  )
}

export function FootprintControls({ settings, set }: WidgetProps) {
  return (
    <Segmented
      label="Column"
      options={FOOTPRINT_TF}
      value={pick(settings.tf, FOOTPRINT_TF, '1m')}
      onChange={(tf) => set({ tf })}
    />
  )
}
