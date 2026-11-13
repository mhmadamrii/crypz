import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { computeMetrics, tradesCsv, type Metrics } from '@/lib/bots/metrics'
import type { BacktestResult, Side } from '@/lib/bots/types'
import { fmtNum, fmtPct, fmtPrice, fmtSigned, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DrawdownChart, EquityChart, RHistogram } from './curves'

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
const orDash = (n: number | null, f: (n: number) => string) => (n === null ? '–' : f(n))

export function Results({ result }: { result: BacktestResult }) {
  const { config: cfg, coverage: cov } = result
  const m = useMemo(
    () => computeMetrics(result.trades, result.equity, cfg.initialEquity, { from: cov.firstTime, to: cov.lastTime }),
    [result, cfg.initialEquity, cov.firstTime, cov.lastTime],
  )
  const skippedBy = useMemo(() => {
    const n = new Map<string, number>()
    for (const s of result.skipped) n.set(s.reason, (n.get(s.reason) ?? 0) + 1)
    return [...n.entries()]
  }, [result.skipped])

  return (
    <div className="flex flex-col gap-10">
      {result.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 border border-border px-3 py-2 text-xs text-pretty text-muted-foreground">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <Summary m={m} />

      <section className="flex flex-col gap-3" aria-label="Equity curve">
        <h2 className="border-b border-border pb-2 label">Equity (closed trades)</h2>
        <EquityChart equity={result.equity} initial={cfg.initialEquity} />
        <h2 className="border-b border-border pb-2 label">Drawdown</h2>
        <DrawdownChart equity={result.equity} />
        <p className="text-xs text-pretty text-muted-foreground">
          Equity changes when a trade closes. It does not count the open trade’s profit or loss in between, so a
          drawdown inside a trade is not shown.
        </p>
      </section>

      {result.trades.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="R distribution">
          <h2 className="border-b border-border pb-2 label">Trades by R multiple</h2>
          <RHistogram rs={result.trades.map((t) => t.r)} />
        </section>
      )}

      <Trades result={result} />

      <section className="flex flex-col gap-3" aria-label="Assumptions">
        <h2 className="border-b border-border pb-2 label">What this run assumed</h2>
        <ul className="flex max-w-prose flex-col gap-1.5 text-sm text-pretty text-muted-foreground">
          <li>
            Data: {cov.entryCandles.toLocaleString()} {cfg.entryBar} candles from {utc(cov.firstTime)} to{' '}
            {utc(cov.lastTime)} UTC, plus {cov.trendCandles.toLocaleString()} {cfg.trendBar} candles (including
            indicator warm-up). Missing: {cov.missingEntry} on {cfg.entryBar}, {cov.missingTrend} on {cfg.trendBar}.
          </li>
          <li>
            Signals read closed candles only. The order fills at the open of the next {cfg.entryBar} candle; the{' '}
            {cfg.trendBar} trend is the last {cfg.trendBar} candle closed by the signal’s close.
          </li>
          <li>
            Stop and target: a candle that reaches the stop is a stop even if it also reaches the target. A candle that
            opens past the stop fills at its open. The target is a limit order: it fills at its price (at the open on a
            gap).
          </li>
          <li>
            Costs: taker fee {fmtNum(cfg.feeRate * 100, 3)}% of notional on entry and on exit (the rate is the one you
            typed, not read from your account); slippage {cfg.slippageBps} bp against you on market fills (entry, stop,
            end of data).
            {cfg.slippageBps === 0 && ' With no slippage, results tend to be optimistic.'}
          </li>
          <li>
            Size: {cfg.riskPct}% of current equity over the entry-to-stop distance, rounded down to the contract’s lot
            size. A trade under the minimum order, or needing more than {cfg.maxLeverage}× leverage, is skipped.
            Isolated margin, liquidation and funding are not simulated.
          </li>
          <li>
            The risk is the nominal distance to the stop. Gaps, slippage and fees can lose more than {cfg.riskPct}%.
          </li>
          {skippedBy.length > 0 && (
            <li>Skipped signals: {skippedBy.map(([why, n]) => `${n} × ${why}`).join(' · ')}.</li>
          )}
        </ul>
      </section>
    </div>
  )
}

function Summary({ m }: { m: Metrics }) {
  const rows: [string, string, string?][] = [
    ['Initial equity', `${fmtNum(m.initialEquity)} USDT`],
    ['Final equity', `${fmtNum(m.finalEquity)} USDT`],
    ['Net PnL', `${fmtSigned(m.netPnl)} USDT · ${fmtSigned(m.netPct)}%`, tone(m.netPnl)],
    ['Trades', String(m.trades)],
    ['Win rate', orDash(m.winRate, (n) => fmtPct(n, 1))],
    ['Profit factor', m.profitFactor === Infinity ? '∞' : orDash(m.profitFactor, (n) => fmtNum(n))],
    ['Avg win', orDash(m.avgWin, (n) => fmtSigned(n)), 'text-up'],
    ['Avg loss', orDash(m.avgLoss, (n) => fmtSigned(n)), 'text-down'],
    [
      'Expectancy / trade',
      m.expectancy === null ? '–' : `${fmtSigned(m.expectancy)} USDT · ${fmtSigned(m.expectancyR ?? 0)}R`,
      tone(m.expectancy ?? 0),
    ],
    ['Avg R', orDash(m.avgR, (n) => `${fmtSigned(n)}R`), tone(m.avgR ?? 0)],
    [
      'Max drawdown',
      `−${fmtNum(m.maxDrawdown)} USDT · −${fmtNum(m.maxDrawdownPct)}%`,
      m.maxDrawdown ? 'text-down' : '',
    ],
    ['Total fees', `${fmtNum(m.totalFees)} USDT`],
    ['Slippage cost', `${fmtNum(m.totalSlippage)} USDT`],
    ['Time in market', orDash(m.exposure, (n) => fmtPct(n, 1))],
  ]
  return (
    <section aria-label="Summary">
      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5">
            <dt className="label">{k}</dt>
            <dd className={cn('num text-sm', cls)}>{v}</dd>
          </div>
        ))}
      </dl>
      {m.trades === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No trade met every rule in this range. That is a result, not an error: widen the dates or relax the parameters
          (and keep in mind that fitting them to this one range proves little).
        </p>
      )}
    </section>
  )
}

function Trades({ result }: { result: BacktestResult }) {
  const [side, setSide] = useState<'all' | Side>('all')
  const rows = side === 'all' ? result.trades : result.trades.filter((t) => t.side === side)

  const download = () => {
    const url = URL.createObjectURL(new Blob([tradesCsv(result.trades)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.config.symbol}-bot-trades.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Trade history">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <h2 className="label">Trade history · {rows.length}</h2>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={side}
            onValueChange={(v) => v && setSide(v as 'all' | Side)}
            aria-label="Side"
          >
            {(['all', 'long', 'short'] as const).map((s) => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="px-2.5 text-xs capitalize data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {s}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={download} disabled={!result.trades.length}>
            <Download />
            CSV
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No trades.</p>
      ) : (
        <Table className="num text-xs whitespace-nowrap">
          <TableHeader>
            <TableRow>
              {[
                '#',
                'Side',
                'Entry (UTC)',
                'Entry',
                'Stop',
                'Target',
                'Exit (UTC)',
                'Exit',
                'Reason',
                'Size',
                'Risk',
                'Gross',
                'Fees',
                'Net',
                'R',
                'Equity',
              ].map((h) => (
                <TableHead key={h} className="label">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.id}</TableCell>
                <TableCell className="capitalize">{t.side}</TableCell>
                <TableCell>{utc(t.entryTime)}</TableCell>
                <TableCell>{fmtPrice(t.entry)}</TableCell>
                <TableCell>{fmtPrice(t.stop)}</TableCell>
                <TableCell>{fmtPrice(t.target)}</TableCell>
                <TableCell>{utc(t.exitTime)}</TableCell>
                <TableCell>{fmtPrice(t.exit)}</TableCell>
                <TableCell>{t.reason === 'end_of_data' ? 'end of data' : t.reason}</TableCell>
                <TableCell>
                  {t.contracts} <span className="text-muted-foreground">ct</span>
                </TableCell>
                <TableCell>{fmtNum(t.riskBudget)}</TableCell>
                <TableCell className={tone(t.grossPnl)}>{fmtSigned(t.grossPnl)}</TableCell>
                <TableCell>{fmtNum(t.fees)}</TableCell>
                <TableCell className={tone(t.netPnl)}>{fmtSigned(t.netPnl)}</TableCell>
                <TableCell className={tone(t.r)}>{fmtSigned(t.r)}R</TableCell>
                <TableCell>{fmtNum(t.equityAfter)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
