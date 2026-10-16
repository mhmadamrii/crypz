import { cn } from '@/lib/utils'
import { Candles, series } from './candles'

// Login panel illustration: a rally and its pullback, marked up the way the replay's drawing tools mark it.
// A fib retracement from swing low to swing high (selected, so its square handles show) and a rising trend line.
// Inks follow DESIGN.md's drawing rules: fib edges muted, the retracement zone in full ink, extensions dotted.

const LEVELS = [1, 0.618, 0.5, 0, -0.2]
const rallyThenPullback = (t: number) => (t < 0.62 ? 0.6 : -0.62)

export function LoginArt({ className }: { className?: string }) {
  // close to the panel's own shape, so the drawing fills it instead of floating in margins
  const w = 980
  const h = 720
  const font = 15
  const axis = font * 6.2
  const count = 46
  const data = series(count, 11, rallyThenPullback, 79_800)
  const step = (w - axis) / count
  const body = step * 0.58
  const x = (i: number) => i * step + step / 2

  // swing low in the first third, swing high across the whole run
  const lowIdx = data.slice(0, Math.floor(count / 3)).reduce((m, k, i, a) => (k.l < a[m].l ? i : m), 0)
  const highIdx = data.reduce((m, k, i) => (k.h > data[m].h ? i : m), 0)
  const low = data[lowIdx].l
  const high = data[highIdx].h
  const fib = (level: number) => high + (low - high) * level

  const top = font * 7
  const bottom = h - font * 5
  const lo = Math.min(low, ...data.map((k) => k.l))
  const hi = Math.max(fib(-0.2), ...data.map((k) => k.h))
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (bottom - top)

  // trend line through the swing low and the lowest low of the next leg up, carried to the right edge
  const lowIdx2 = data
    .slice(lowIdx + 6, highIdx)
    .reduce((m, k, i) => (k.l < data[m].l ? i + lowIdx + 6 : m), lowIdx + 6)
  const slope = (data[lowIdx2].l - low) / (lowIdx2 - lowIdx)
  const trendY = (i: number) => low + slope * (i - lowIdx)
  // a trend line ends where price breaks it: a few bars past the first close below
  const broken = data.findIndex((k, i) => i > lowIdx2 && k.c < trendY(i))
  const trendEnd = Math.min(count - 1, (broken < 0 ? count - 1 : broken) + 2)

  const last = data[count - 1].c
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
  const handle = (cx: number, cy: number) => (
    <rect
      x={cx - 4}
      y={cy - 4}
      width="8"
      height="8"
      fill="var(--background)"
      stroke="currentColor"
      strokeWidth="1.25"
    />
  )

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('block', className)}
      role="img"
      aria-label="A rally and pullback marked with a fib retracement and a trend line"
      style={{ fontFamily: 'var(--font-mono)', fontSize: font }}
    >
      {/* fib levels: edges recede, the retracement zone carries the ink, the extension is dotted */}
      {LEVELS.map((level) => {
        const yy = y(fib(level))
        const strong = level > 0 && level < 1
        const tone = strong ? 'currentColor' : 'var(--muted-foreground)'
        return (
          <g key={level}>
            <line
              x1={x(lowIdx)}
              x2={w - axis}
              y1={yy}
              y2={yy}
              stroke={tone}
              strokeWidth={strong ? 1.25 : 1}
              strokeDasharray={level < 0 ? '2 4' : undefined}
            />
            {/* level 1 sits on the swing-low handle, so its label steps clear of it */}
            <text x={x(lowIdx) + font * (level === 1 ? 1.4 : 0.5)} y={yy - font * 0.5} fill={tone}>
              {level} · {fmt(fib(level))}
            </text>
          </g>
        )
      })}
      <rect
        x={x(lowIdx)}
        y={y(fib(0.5))}
        width={w - axis - x(lowIdx)}
        height={y(fib(0.618)) - y(fib(0.5))}
        fill="currentColor"
        opacity="0.06"
      />
      <line
        x1={x(lowIdx)}
        y1={y(low)}
        x2={x(highIdx)}
        y2={y(high)}
        stroke="var(--muted-foreground)"
        strokeDasharray="5 5"
      />

      <Candles data={data} x={x} y={y} body={body} />

      {/* trend line under the higher lows */}
      <line
        x1={x(lowIdx)}
        y1={y(trendY(lowIdx))}
        x2={x(trendEnd)}
        y2={y(trendY(trendEnd))}
        stroke="currentColor"
        strokeWidth="1.75"
      />

      {/* the fib is the selected drawing: its two square handles show */}
      {handle(x(lowIdx), y(low))}
      {handle(x(highIdx), y(high))}

      {/* price axis + last price */}
      {[0.15, 0.38, 0.62, 0.85].map((f) => {
        const v = lo + (hi - lo) * f
        return Math.abs(y(v) - y(last)) > font * 1.6 ? (
          <text key={f} x={w - axis + font * 0.8} y={y(v)} dy="0.35em" fill="var(--muted-foreground)">
            {fmt(v)}
          </text>
        ) : null
      })}
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
    </svg>
  )
}
