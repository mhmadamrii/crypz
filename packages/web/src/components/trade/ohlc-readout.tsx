import type { ReactNode } from 'react'
import type { Candle } from '@crypz/exchanges'
import { fmtPrice, fmtSigned } from '@/lib/format'

/** The open/high/low/close line in a chart's top-left corner; `children` add a chart's own figures after it. */
export function OhlcReadout({ k, children }: { k: Candle; children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-2 left-3 z-10 flex flex-wrap gap-x-3 gap-y-0.5 num text-[11px] text-muted-foreground">
      {(['open', 'high', 'low', 'close'] as const).map((f) => (
        <span key={f}>
          {f[0].toUpperCase()} <span className="text-foreground">{fmtPrice(k[f])}</span>
        </span>
      ))}
      <span className="text-foreground">{fmtSigned(((k.close - k.open) / k.open) * 100)}%</span>
      {children}
    </div>
  )
}
