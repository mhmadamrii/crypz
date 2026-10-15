import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { CurvePoint } from '@crypz/exchanges'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { fmtDate, fmtSigned, tone } from '@/lib/format'

const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

const config = { v: { label: 'Cumulative PnL', color: 'var(--foreground)' } } satisfies ChartConfig

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11, fontFamily: 'var(--font-mono)' }

function CurveTooltip({ active, payload }: { active?: boolean; payload?: { payload: CurvePoint }[] }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="grid min-w-52 gap-2 border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground">
      <span className="num text-muted-foreground">{fmtDate(p.t)}</span>
      <div className="flex items-baseline justify-between gap-6">
        <span className="text-muted-foreground">Cumulative</span>
        <span className={cn('num text-sm font-medium', tone(p.v))}>{fmtSigned(p.v)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-6 border-t border-hairline pt-2">
        <span>
          {p.symbol} <span className="label">{p.side}</span>
        </span>
        <span className={cn('num', tone(p.delta))}>{fmtSigned(p.delta, 4)}</span>
      </div>
    </div>
  )
}

/** Cumulative realized PnL over close time. Steps, because PnL only changes when a position closes. */
export function EquityCurve({ curve, maxDrawdown }: { curve: CurvePoint[]; maxDrawdown: number }) {
  const dd = useMemo(() => {
    let peak = -Infinity
    let peakI = 0
    let best = { from: 0, to: 0, depth: 0 }
    curve.forEach((c, i) => {
      if (c.v > peak) {
        peak = c.v
        peakI = i
      }
      if (peak - c.v > best.depth) best = { from: peakI, to: i, depth: peak - c.v }
    })
    return best
  }, [curve])

  if (curve.length < 2)
    return (
      <div className="grid h-48 place-items-center text-sm text-muted-foreground">
        Not enough trades to draw a curve.
      </div>
    )

  const last = curve[curve.length - 1]
  const low = curve.reduce((m, c) => (c.v < m.v ? c : m), curve[0])

  return (
    <figure className="flex flex-col gap-2">
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={curve} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--hairline)" />
          {dd.depth > 0 && (
            <ReferenceArea
              x1={curve[dd.from].t}
              x2={curve[dd.to].t}
              fill="var(--foreground)"
              fillOpacity={0.05}
              stroke="none"
              ifOverflow="hidden"
            />
          )}
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtDay}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={48}
          />
          <YAxis
            orientation="right"
            tickFormatter={(v: number) => fmtSigned(v, 0)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '2 3' }}
            content={<CurveTooltip />}
            isAnimationActive={false}
          />
          <Line
            dataKey="v"
            type="stepAfter"
            stroke="var(--color-v)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            activeDot={({ cx, cy }: { cx?: number; cy?: number }) => (
              <rect x={(cx ?? 0) - 3.5} y={(cy ?? 0) - 3.5} width={7} height={7} fill="var(--foreground)" />
            )}
          />
        </LineChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Now <span className={cn('num', tone(last.v))}>{fmtSigned(last.v)}</span> · low{' '}
          <span className="num text-down">{fmtSigned(low.v)}</span> on {fmtDay(low.t)}
        </span>
        <span>
          Shaded: max drawdown <span className="num text-down">−{maxDrawdown.toFixed(2)}</span> · hover for each close
        </span>
      </figcaption>
    </figure>
  )
}
