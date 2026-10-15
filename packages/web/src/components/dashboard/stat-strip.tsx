import type { AccountSnapshot, Stats } from '@crypz/exchanges'
import { RollingNumber } from '@/components/rolling-number'
import { cn } from '@/lib/utils'
import { fmtNum, fmtSigned, tone } from '@/lib/format'

function Cell({
  label,
  children,
  foot,
  className,
}: {
  label: string
  children: React.ReactNode
  foot?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2 border-hairline p-5', className)}>
      <span className="label">{label}</span>
      <div className="text-2xl font-medium tracking-tight">{children}</div>
      {foot && <div className="mt-auto text-xs text-muted-foreground">{foot}</div>}
    </div>
  )
}

/** Account state first, then the verdict on the selected range. */
export function StatStrip({ accounts, stats }: { accounts: AccountSnapshot[]; stats: Stats }) {
  const equity = accounts.reduce((s, a) => s + a.totalEquity, 0)
  const buckets = accounts.flatMap((a) => a.buckets).filter((b) => b.value > 0.005)
  const upl = accounts.reduce<number | null>((s, a) => (a.unrealizedPnl == null ? s : (s ?? 0) + a.unrealizedPnl), null)
  const [whole, frac] = fmtNum(equity).split('.')
  const pf = Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'

  return (
    <div className="grid grid-cols-2 border border-border lg:grid-cols-[1.6fr_repeat(4,1fr)] [&>*]:border-b lg:[&>*]:border-b-0 [&>*:not(:last-child)]:lg:border-r">
      <Cell
        label="Equity · USDT"
        className="col-span-2 border-r-0 lg:col-span-1"
        foot={
          accounts.length ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1 num">
              {buckets.map((b) => (
                <span key={b.name}>
                  {b.name} {fmtNum(b.value)}
                </span>
              ))}
              {upl != null && <span className={tone(upl)}>uPnL {fmtSigned(upl)}</span>}
            </span>
          ) : (
            'Balance unavailable'
          )
        }
      >
        {accounts.length ? (
          <span className="text-4xl sm:text-5xl">
            <RollingNumber value={whole} />
            <span className="text-muted-foreground">
              <RollingNumber value={`.${frac}`} />
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </Cell>
      <Cell
        label="Realized PnL"
        className="border-r"
        foot={<span className="num">Gross {fmtSigned(stats.gross)}</span>}
      >
        <RollingNumber value={fmtSigned(stats.realized)} className={tone(stats.realized)} />
      </Cell>
      <Cell
        label="Win rate"
        foot={
          <span className="num">
            {stats.wins}W · {stats.losses}L
          </span>
        }
      >
        <RollingNumber value={`${(stats.winRate * 100).toFixed(1)}%`} />
      </Cell>
      <Cell
        label="Profit factor"
        className="border-r"
        foot={<span className="num">Expectancy {fmtSigned(stats.expectancy, 3)} / trade</span>}
      >
        <RollingNumber value={pf} />
      </Cell>
      <Cell
        label="Fees + funding"
        foot={
          <span className="num">
            Fees {fmtSigned(stats.fees)} · Funding {fmtSigned(stats.funding)}
          </span>
        }
      >
        <RollingNumber value={fmtSigned(stats.fees + stats.funding)} className={tone(stats.fees + stats.funding)} />
      </Cell>
    </div>
  )
}
