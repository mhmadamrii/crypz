import { fmtSigned } from '@/lib/format'
import { cn } from '@/lib/utils'

const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

/** Cumulative realized PnL over close time; zero, peak, trough and last value labelled, deepest drawdown shaded. */
export function EquityCurve({ curve, maxDrawdown }: { curve: { t: number; v: number }[]; maxDrawdown: number }) {
  if (curve.length < 2)
    return (
      <div className="grid h-48 place-items-center text-sm text-muted-foreground">
        Not enough trades to draw a curve.
      </div>
    )

  const W = 1000
  const H = 220
  const t0 = curve[0].t
  const t1 = curve[curve.length - 1].t
  const vs = curve.map((c) => c.v)
  const min = Math.min(0, ...vs)
  const max = Math.max(0, ...vs)
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H
  const d = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.t).toFixed(1)},${y(c.v).toFixed(1)}`).join('')

  let peak = -Infinity
  let peakI = 0
  let dd = { from: 0, to: 0, depth: 0 }
  curve.forEach((c, i) => {
    if (c.v > peak) {
      peak = c.v
      peakI = i
    }
    if (peak - c.v > dd.depth) dd = { from: peakI, to: i, depth: peak - c.v }
  })

  const last = curve[curve.length - 1]
  const lo = curve[vs.indexOf(min)] ?? last
  const pct = (v: number) => `${(y(v) / H) * 100}%`
  // Gutter labels must not collide: place in priority order, skip any within 14px of one already placed.
  const PLOT_PX = 224 // h-56
  const placed = [y(last.v)]
  const clear = (v: number) => {
    const py = (y(v) / H) * PLOT_PX
    if (placed.some((q) => Math.abs((q / H) * PLOT_PX - py) < 14)) return false
    placed.push(y(v))
    return true
  }
  const marks = [
    { key: 'low', v: min, label: `low ${fmtSigned(min)}`, show: min < 0 && clear(min) },
    { key: 'peak', v: max, label: `peak ${fmtSigned(max)}`, show: max > 0 && clear(max) },
    { key: 'zero', v: 0, label: '0', show: clear(0) },
  ]

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-56 w-full overflow-visible"
          role="img"
          aria-label={`Cumulative realized PnL from ${fmtDay(t0)} to ${fmtDay(t1)}, ending at ${fmtSigned(last.v)} USDT; peak ${fmtSigned(max)}, low ${fmtSigned(min)}`}
        >
          <rect
            x={x(curve[dd.from].t)}
            y={0}
            width={Math.max(x(curve[dd.to].t) - x(curve[dd.from].t), 1)}
            height={H}
            fill="var(--foreground)"
            opacity="0.05"
          />
          {marks
            .filter((m) => m.show || m.key === 'zero')
            .map((m) => (
              <line
                key={m.key}
                x1={0}
                x2={W}
                y1={y(m.v)}
                y2={y(m.v)}
                stroke="var(--border)"
                strokeDasharray={m.key === 'zero' ? '4 4' : '1 5'}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          <path d={d} fill="none" stroke="var(--foreground)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="relative h-56" aria-hidden>
          {marks
            .filter((m) => m.show)
            .map((m) => (
              <span
                key={m.key}
                className="absolute right-0 -translate-y-1/2 num text-[11px] whitespace-nowrap text-muted-foreground"
                style={{ top: pct(m.v) }}
              >
                {m.label}
              </span>
            ))}
          <span
            className={cn(
              'absolute left-0 -translate-y-1/2 bg-background px-1 num text-xs font-medium whitespace-nowrap',
              last.v >= 0 ? 'text-up' : 'text-down',
            )}
            style={{ top: pct(last.v) }}
          >
            {fmtSigned(last.v)}
          </span>
        </div>
      </div>
      <figcaption className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 text-xs text-muted-foreground">
        <span className="flex justify-between gap-4">
          <span className="num">{fmtDay(t0)}</span>
          <span>
            Shaded: max drawdown <span className="num text-down">−{maxDrawdown.toFixed(2)}</span>
            {lo !== last && <span className="hidden sm:inline"> · low on {fmtDay(lo.t)}</span>}
          </span>
          <span className="num">{fmtDay(t1)}</span>
        </span>
      </figcaption>
    </figure>
  )
}
