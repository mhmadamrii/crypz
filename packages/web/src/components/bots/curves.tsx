import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { fmtNum } from '@/lib/format'
import { drawdownCurve } from '@/lib/bots/metrics'
import type { EquityPoint } from '@/lib/bots/types'

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12, fontFamily: 'var(--font-mono)' }
const fmtDay = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const fmtStamp = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

const equityConfig = { equity: { label: 'Equity', color: 'var(--foreground)' } } satisfies ChartConfig
const ddConfig = { pct: { label: 'Drawdown', color: 'var(--down)' } } satisfies ChartConfig

function Tip({
  active,
  payload,
  unit,
}: {
  active?: boolean
  payload?: { payload: Record<string, number> }[]
  unit: 'equity' | 'dd'
}) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg shadow-black/10">
      <span className="num text-muted-foreground">{fmtStamp(p.time)}</span>
      {unit === 'equity' ? (
        <span className="num text-sm font-medium">{fmtNum(p.equity)} USDT</span>
      ) : (
        <span className="num text-sm font-medium text-down">
          −{fmtNum(p.pct)}% · −{fmtNum(p.drawdown)} USDT
        </span>
      )}
    </div>
  )
}

const empty = (
  <div className="grid h-48 place-items-center text-sm text-muted-foreground">Not enough trades to draw a curve.</div>
)

/** Closed-trade equity: it steps when a trade closes and does not mark the open position to market. */
export function EquityChart({ equity, initial }: { equity: EquityPoint[]; initial: number }) {
  if (equity.length < 2) return empty
  return (
    <ChartContainer config={equityConfig} className="aspect-auto h-56 w-full">
      <LineChart data={equity} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--hairline)" />
        <ReferenceLine y={initial} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          dataKey="time"
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
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => fmtNum(v, 0)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '2 3' }}
          content={<Tip unit="equity" />}
          isAnimationActive={false}
        />
        <Line
          dataKey="equity"
          type="stepAfter"
          stroke="var(--color-equity)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

export function DrawdownChart({ equity }: { equity: EquityPoint[] }) {
  const data = useMemo(() => drawdownCurve(equity).map((p) => ({ ...p, pct: p.pct })), [equity])
  if (data.length < 2) return empty
  return (
    <ChartContainer config={ddConfig} className="aspect-auto h-40 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--hairline)" />
        <XAxis
          dataKey="time"
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
          reversed
          tickFormatter={(v: number) => `${fmtNum(v, 1)}%`}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '2 3' }}
          content={<Tip unit="dd" />}
          isAnimationActive={false}
        />
        <Area
          dataKey="pct"
          type="stepAfter"
          stroke="var(--color-pct)"
          fill="var(--color-pct)"
          fillOpacity={0.15}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

/** Trades per R bucket: what each trade returned, in multiples of what it risked. */
export function RHistogram({ rs }: { rs: number[] }) {
  const bins = useMemo(() => {
    const edges = [-Infinity, -1.5, -1.05, -0.5, 0, 0.5, 1, 2, 2.9, Infinity]
    const labels = ['< −1.5', '−1.5…−1', '−1…−0.5', '−0.5…0', '0…0.5', '0.5…1', '1…2', '2…2.9', '≥ 2.9']
    return labels.map((label, i) => ({ label, n: rs.filter((r) => r >= edges[i] && r < edges[i + 1]).length }))
  }, [rs])
  const max = Math.max(1, ...bins.map((b) => b.n))
  if (!rs.length) return null
  return (
    <ol className="flex flex-col gap-1 num text-xs" aria-label="Trades by R multiple">
      {bins.map((b) => (
        <li key={b.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-2">
          <span className="text-muted-foreground">{b.label}</span>
          <span className="h-2 bg-hairline">
            <span className="block h-full bg-foreground" style={{ width: `${(b.n / max) * 100}%` }} />
          </span>
          <span className="text-right">{b.n}</span>
        </li>
      ))}
    </ol>
  )
}
