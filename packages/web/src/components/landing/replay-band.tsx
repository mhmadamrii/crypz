import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { marketStructure } from '@/lib/indicators/structure'
import { cn } from '@/lib/utils'
import { Candles, series } from './candles'

// The landing page's Replay band: one large hand-plotted chart in the world's hollow-candle ink, cut by a replay
// cursor. Left of it the market as you would see it mid-session, with a long position drawn on; right of it the
// hatched "next bar hidden" void. Synthetic and deterministic, so server and client render the same picture. Market
// structure is the app's own indicator run over the revealed candles, drawn the way the chart's structure layer is.

/** A sell-off, a base, then a rally: the arc a trader wants to have read correctly. Gentle, so each bar's own range
 * reads against the trend the way real candles do. */
const arc = (t: number) => (t < 0.34 ? -0.34 : t < 0.56 ? 0.03 : 0.36)

type ArtProps = {
  /** viewBox width/height; the chart scales to its container width. */
  w: number
  h: number
  count: number
  /** Index of the last revealed candle (the replay cursor). */
  cursor: number
  /** Candle the long position was opened on. */
  entry: number
  font: number
  /** Text on the tag past the cursor. */
  hidden: string
  /** Bars either side of a swing point. */
  swing: number
  /** Picks the price path; chosen so the sell-off breaks down and the rally turns structure up. */
  seed: number
  className?: string
}

function CandleArt({ w, h, count, cursor, entry, font, hidden, swing, seed, className }: ArtProps) {
  const all = series(count, seed, arc, 84_400, 1.7)
  const shown = all.slice(0, cursor + 1)
  const structure = marketStructure(
    shown.map((k, i) => ({ time: i, open: k.o, high: k.h, low: k.l, close: k.c })),
    swing,
  )
  const axis = font * 6.2
  const step = (w - axis) / count
  const body = Math.max(3, step * 0.62)
  const top = font * 2.4
  const bottom = h - font * 2.6

  const e = shown[entry].c
  const stop = Math.min(...shown.slice(entry - 6, entry + 1).map((k) => k.l)) - 120
  const risk = e - stop
  const peak = Math.max(...shown.slice(entry).map((k) => k.h))
  // the long is still open at the cursor, so the target sits above anything printed since entry
  const target = Math.max(e + risk * 2.6, peak + risk * 0.7)
  const lo = Math.min(stop, ...shown.map((k) => k.l))
  const hi = Math.max(target, ...shown.map((k) => k.h))
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (bottom - top)
  const x = (i: number) => i * step + step / 2
  const cx = x(cursor) + step / 2
  const last = shown[cursor].c
  const r = risk > 0 ? (last - e) / risk : 0
  // the open result sits clear of the latest wicks
  const rAt = Math.min(y(last) - font * 1.4, y(Math.max(...shown.slice(-4).map((k) => k.h))) - font * 0.7)

  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 6)
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
  const posEnd = x(Math.min(count - 1, cursor + Math.round(count * 0.14)))

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('block h-auto w-full', className)}
      role="img"
      aria-label="A replay in progress: a long position opened after a sell-off, the next candles still hidden"
      style={{ fontFamily: 'var(--font-mono)', fontSize: font }}
    >
      <defs>
        <pattern
          id={`hatch-${w}`}
          width={font * 0.9}
          height={font * 0.9}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2={font * 0.9} stroke="var(--border)" strokeWidth="1.25" />
        </pattern>
      </defs>

      {/* grid + price axis */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1="0" x2={w - axis} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth="1" />
          {/* the last-price tag owns its row */}
          {Math.abs(y(t) - y(last)) > font * 1.6 && (
            <text x={w - axis + font * 0.8} y={y(t)} dy="0.35em" fill="var(--muted-foreground)">
              {fmt(t)}
            </text>
          )}
        </g>
      ))}

      {/* long position: target and stop zones, the only colour on the page's chart */}
      <rect
        x={x(entry)}
        y={y(target)}
        width={posEnd - x(entry)}
        height={y(e) - y(target)}
        fill="var(--up)"
        opacity="0.13"
      />
      <rect x={x(entry)} y={y(e)} width={posEnd - x(entry)} height={y(stop) - y(e)} fill="var(--down)" opacity="0.13" />
      <line
        x1={x(entry)}
        x2={posEnd}
        y1={y(e)}
        y2={y(e)}
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeDasharray="6 5"
      />
      <text x={x(entry) + font * 0.6} y={y(target) - font * 0.7} fill="var(--up)">
        Target {fmt(target)}
      </text>
      <text x={x(entry) + font * 0.6} y={y(stop) + font * 1.4} fill="var(--down)">
        Stop {fmt(stop)}
      </text>

      {/* candles revealed so far; the last stretch steps in like the replay does */}
      <g className="replay-reveal" style={{ ['--reveal-from' as string]: `${(x(cursor - 24) / w) * 100}%` }}>
        <Candles data={shown} x={x} y={y} body={body} />
        {/* the levels the next break would come from, up to the cursor */}
        {[structure.lastHigh, structure.lastLow].map(
          (sw) =>
            sw && (
              <line
                key={sw.kind}
                x1={x(sw.index)}
                x2={cx}
                y1={y(sw.price)}
                y2={y(sw.price)}
                stroke="currentColor"
                strokeOpacity="0.45"
                strokeDasharray="1.5 4"
              />
            ),
        )}
        {/* each break runs from the swing it took to the candle that closed through it: dashed BOS, solid CHoCH */}
        {structure.breaks.map((b) => {
          const hue = b.dir === 'up' ? 'var(--up)' : 'var(--down)'
          const at = y(b.from.price)
          return (
            <g key={b.index} fill={hue}>
              <line
                x1={x(b.from.index)}
                x2={x(b.index)}
                y1={at}
                y2={at}
                stroke={hue}
                strokeWidth="1.25"
                strokeDasharray={b.type === 'BOS' ? '6 4' : undefined}
              />
              <text
                x={(x(b.from.index) + x(b.index)) / 2}
                y={b.dir === 'up' ? at - font * 0.45 : at + font * 1.15}
                textAnchor="middle"
              >
                {b.type}
              </text>
            </g>
          )
        })}
        {structure.swings.map(
          (sw) =>
            sw.label && (
              <text
                key={`${sw.kind}-${sw.index}`}
                x={x(sw.index)}
                y={sw.kind === 'high' ? y(sw.price) - font * 0.5 : y(sw.price) + font * 1.2}
                textAnchor="middle"
                fill="var(--muted-foreground)"
              >
                {sw.label}
              </text>
            ),
        )}
        {/* entry arrow under the entry candle */}
        <path
          d={`M ${x(entry)} ${y(shown[entry].l) + font * 0.9} l ${-font * 0.55} ${font * 0.8} h ${font * 1.1} z`}
          fill="currentColor"
        />
        <text x={x(entry)} y={y(shown[entry].l) + font * 2.9} textAnchor="middle" fill="currentColor">
          L
        </text>
      </g>

      {/* the future: nothing past the cursor exists yet */}
      <rect x={cx} y="0" width={w - axis - cx} height={h - font * 1.2} fill={`url(#hatch-${w})`} />
      <rect x={cx} y="0" width={w - axis - cx} height={h - font * 1.2} fill="var(--background)" opacity="0.35" />
      <line x1={cx} x2={cx} y1="0" y2={h - font * 1.2} stroke="currentColor" strokeWidth="1.5" />
      <rect
        x={cx + font * 0.8}
        y={top}
        width={font * (hidden.length * 0.62 + 1.4)}
        height={font * 2}
        fill="var(--background)"
        stroke="var(--border)"
      />
      <text x={cx + font * 1.5} y={top + font * 1.32} fill="currentColor">
        {hidden}
      </text>

      {/* last price + live result of the open long */}
      <line
        x1={x(cursor)}
        x2={w - axis}
        y1={y(last)}
        y2={y(last)}
        stroke="var(--muted-foreground)"
        strokeDasharray="2 4"
      />
      <rect
        x={w - axis + font * 0.3}
        y={y(last) - font * 0.85}
        width={axis - font * 0.4}
        height={font * 1.7}
        fill="currentColor"
      />
      <text x={w - axis + font * 0.8} y={y(last)} dy="0.35em" fill="var(--background)">
        {fmt(last)}
      </text>
      <text x={cx - font * 0.8} y={rAt} textAnchor="end" fill={r >= 0 ? 'var(--up)' : 'var(--down)'}>
        {r >= 0 ? '+' : '−'}
        {Math.abs(r).toFixed(1)}R open
      </text>
    </svg>
  )
}

const KEYS: [string, string][] = [
  ['Space', 'play'],
  ['→', 'next bar'],
  ['B', 'long'],
  ['S', 'short'],
  ['X', 'close'],
]

export function ReplayBand() {
  return (
    <section className="border-t border-border">
      <div className="grid gap-6 px-4 pt-16 pb-8 sm:px-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:pt-24">
        <h2 className="text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-7xl">
          Replay any day. Trade it blind.
        </h2>
        <div className="flex flex-col items-start gap-5">
          <p className="max-w-[46ch] text-pretty text-muted-foreground">
            Pick a date or roll a random one. Candles arrive one bar at a time, your stop and target fill like the real
            thing, and nothing past the cursor exists until you step. Free market data, no exchange key needed.
          </p>
          <Button asChild size="lg">
            <Link to="/trade/replay">
              Try Replay <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <figure className="replay-timeline border-t border-border text-foreground">
        <CandleArt
          w={1600}
          h={600}
          count={64}
          cursor={46}
          entry={34}
          font={15}
          swing={4}
          seed={37}
          hidden="Next bar hidden →"
          className="hidden md:block"
        />
        <CandleArt
          w={760}
          h={620}
          count={32}
          cursor={23}
          entry={16}
          font={20}
          swing={3}
          seed={150}
          hidden="Hidden →"
          className="md:hidden"
        />
        <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-muted-foreground sm:px-8">
          {KEYS.map(([k, what]) => (
            <span key={k} className="flex items-center gap-1.5 num text-xs">
              <kbd className="inline-grid h-5 min-w-5 place-items-center border border-border px-1 text-[11px] text-foreground">
                {k}
              </kbd>
              {what}
            </span>
          ))}
          <span className="ml-auto label">Illustration · synthetic candles</span>
        </figcaption>
      </figure>
    </section>
  )
}
