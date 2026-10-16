// Shared ingredients for the public pages' candle illustrations: a deterministic price path (server and client
// draw the same picture) and the world's hollow candles (filled ink = close above open, hollow = below).

export type K = { o: number; h: number; l: number; c: number }

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/** `drift(t)` steers the path over the series (t from 0 to 1), in units of a bar's volatility. */
export function series(n: number, seed: number, drift: (t: number) => number, start = 84_400): K[] {
  const r = rng(seed)
  const out: K[] = []
  let p = start
  for (let i = 0; i < n; i++) {
    const vol = 210 + r() * 160
    const o = p
    const c = o + (r() - 0.5 + drift(i / n) * 0.42) * vol * 2
    out.push({ o, c, h: Math.max(o, c) + r() * vol * 0.9, l: Math.min(o, c) - r() * vol * 0.9 })
    p = c
  }
  return out
}

export function Candles({
  data,
  x,
  y,
  body,
}: {
  data: K[]
  x: (i: number) => number
  y: (v: number) => number
  body: number
}) {
  return (
    <>
      {data.map((k, i) => (
        <g key={i}>
          <line x1={x(i)} x2={x(i)} y1={y(k.h)} y2={y(k.l)} stroke="currentColor" strokeWidth="1.25" />
          <rect
            x={x(i) - body / 2}
            y={y(Math.max(k.o, k.c))}
            width={body}
            height={Math.max(1.5, Math.abs(y(k.o) - y(k.c)))}
            fill={k.c >= k.o ? 'currentColor' : 'var(--background)'}
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </g>
      ))}
    </>
  )
}
