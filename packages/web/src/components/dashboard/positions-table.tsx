import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Position } from '@crypz/exchanges'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { fmtDate, fmtDuration, fmtNum, fmtPct, fmtPrice, fmtSigned, tone } from '@/lib/format'

const PAGE = 50

/** Newest first. */
export function PositionsTable({ positions }: { positions: Position[] }) {
  const [limit, setLimit] = useState(PAGE)
  const rows = positions.slice(0, limit)

  if (!positions.length)
    return (
      <p className="border border-border p-8 text-center text-sm text-muted-foreground">
        No positions match this range.
      </p>
    )

  return (
    <div className="flex flex-col">
      {/* Phones: two-line rows so the result is never off-screen. */}
      <ul className="flex flex-col sm:hidden">
        {rows.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-hairline py-2.5 text-[13px]"
          >
            <a href={p.tradeUrl} target="_blank" rel="noreferrer" className="truncate font-medium">
              {p.symbol}
            </a>
            <span className={cn('text-right num font-medium', tone(p.realizedPnl))}>{fmtSigned(p.realizedPnl, 4)}</span>
            <span className="text-xs text-muted-foreground">
              <span className="label text-foreground">{p.side}</span>{' '}
              <span className="num">
                {p.leverage}x · {fmtDate(p.closedAt)}
              </span>
            </span>
            <span className={cn('text-right num text-xs', tone(p.pnlRatio))}>{fmtPct(p.pnlRatio, 2)}</span>
          </li>
        ))}
      </ul>
      <Table className="hidden text-[13px] sm:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:label [&>th]:font-normal">
            <TableHead>Closed</TableHead>
            <TableHead>Instrument</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Exit</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Hold</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead className="text-right">Funding</TableHead>
            <TableHead className="text-right">Realized</TableHead>
            <TableHead className="text-right">ROE</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} className="border-hairline">
              <TableCell className="num text-muted-foreground">{fmtDate(p.closedAt)}</TableCell>
              <TableCell>
                <a
                  href={p.tradeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {p.symbol}
                  <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </a>
              </TableCell>
              <TableCell>
                <span className="label text-foreground">{p.side}</span>{' '}
                <span className="num text-muted-foreground">{p.leverage}x</span>
              </TableCell>
              <TableCell className="text-right num">{fmtPrice(p.entryPrice)}</TableCell>
              <TableCell className="text-right num">{fmtPrice(p.exitPrice)}</TableCell>
              <TableCell className="text-right num">{p.size}</TableCell>
              <TableCell className="text-right num text-muted-foreground">
                {fmtDuration(p.closedAt - p.openedAt)}
              </TableCell>
              <TableCell className={cn('text-right num', tone(p.pnl))}>{fmtSigned(p.pnl, 4)}</TableCell>
              <TableCell className="text-right num text-muted-foreground">{fmtNum(p.fee, 4)}</TableCell>
              <TableCell className="text-right num text-muted-foreground">{fmtNum(p.funding, 4)}</TableCell>
              <TableCell className={cn('text-right num font-medium', tone(p.realizedPnl))}>
                {fmtSigned(p.realizedPnl, 4)}
              </TableCell>
              <TableCell className={cn('text-right num', tone(p.pnlRatio))}>{fmtPct(p.pnlRatio, 2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t border-hairline pt-4 text-sm text-muted-foreground">
        <span className="num">
          {rows.length} of {positions.length}
        </span>
        {limit < positions.length && (
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, positions.length - limit)} more
          </Button>
        )}
      </div>
    </div>
  )
}
