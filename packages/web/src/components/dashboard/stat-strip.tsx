import type { AccountSnapshot, Stats } from '@crypz/exchanges'
import { RollingNumber } from '@/components/rolling-number'
import { cn } from '@/lib/utils'
import { fmtNum, fmtPct, fmtSigned, tone } from '@/lib/format'

/** Elevated edge, worth calling out — scarce, never decorative. */
const EDGE_PROFIT_FACTOR = 1.2
/** Fees + funding eating a meaningful slice of gross PnL. */
const COSTLY_FEE_SHARE = 0.1

function Cell({
  label,
  children,
  foot,
  flag,
  className,
}: {
  label: string
  children: React.ReactNode
  foot?: React.ReactNode
  /** A coloured top tab, only when this cell is the one number worth flagging on this screen. */
  flag?: 'best' | 'risk'
  className?: string
}) {
  return (
    <div className={cn('relative flex flex-col gap-2 overflow-hidden rounded-xl bg-card p-5', className)}>
      {flag && (
        <span
          aria-hidden
          className={cn(
            'absolute top-0 left-5 h-[3px] w-7 rounded-b-full',
            flag === 'best' ? 'bg-accent-best' : 'bg-accent-risk',
          )}
        />
      )}
      <span className="label">{label}</span>
      <div className="text-[28px] leading-none font-medium tracking-tight">{children}</div>
      {foot && <div className="mt-auto text-[13px] text-muted-foreground">{foot}</div>}
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
  const edgeFlag = Number.isFinite(stats.profitFactor) && stats.profitFactor >= EDGE_PROFIT_FACTOR
  const costFlag = stats.gross !== 0 && Math.abs(stats.fees + stats.funding) > Math.abs(stats.gross) * COSTLY_FEE_SHARE

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.6fr_repeat(4,1fr)]">
      <Cell
        label="Equity · USDT"
        className="col-span-2 lg:col-span-1"
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
          <span className="text-5xl sm:text-6xl">
            <RollingNumber value={whole} />
            <span className="text-muted-foreground">
              <RollingNumber value={`.${frac}`} />
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </Cell>
      <Cell label="Realized PnL" foot={<span className="num">Gross {fmtSigned(stats.gross)}</span>}>
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
        <RollingNumber value={fmtPct(stats.winRate)} />
      </Cell>
      <Cell
        label="Profit factor"
        flag={edgeFlag ? 'best' : undefined}
        foot={<span className="num">Expectancy {fmtSigned(stats.expectancy, 3)} / trade</span>}
      >
        <RollingNumber value={pf} />
      </Cell>
      <Cell
        label="Fees + funding"
        flag={costFlag ? 'risk' : undefined}
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
