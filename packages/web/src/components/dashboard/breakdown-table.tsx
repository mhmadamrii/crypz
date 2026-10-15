import type { Bucket } from '@crypz/exchanges'
import { cn } from '@/lib/utils'
import { fmtPct, fmtSigned, tone } from '@/lib/format'

export function BreakdownTable({ title, buckets }: { title: string; buckets: Bucket[] }) {
  const rows = buckets.filter((b) => b.count)
  return (
    <div className="flex flex-col">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline label [&>th]:pb-2 [&>th]:font-normal">
            <th className="text-left">Bucket</th>
            <th className="text-right">N</th>
            <th className="text-right">Win</th>
            <th className="text-right">Net USDT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} className="border-b border-hairline [&>td]:py-2">
              <td>{b.label}</td>
              <td className="text-right num text-muted-foreground">{b.count}</td>
              <td className="text-right num text-muted-foreground">{fmtPct(b.winRate, 0)}</td>
              <td className={cn('text-right num', tone(b.realized))}>{fmtSigned(b.realized)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
