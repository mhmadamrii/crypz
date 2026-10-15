import { cn } from '@/lib/utils'

// 4×4 pixel "C": the crypz glyph. One square per cell, like the mosaic.
const CELLS = ['1111', '1000', '1001', '1111']

export function PixelLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 4 4" className={cn('size-6 shrink-0', className)} shapeRendering="crispEdges" aria-hidden>
      {CELLS.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === '1' ? <rect key={`${x}${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null,
        ),
      )}
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-semibold tracking-[-0.03em]', className)}>
      <PixelLogo className="size-[1em]" />
      crypz
    </span>
  )
}
