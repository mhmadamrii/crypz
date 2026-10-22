export const fmtSigned = (n: number, digits = 2) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

export const fmtNum = (n: number, digits = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Prices arrive with arbitrary precision (e.g. 75274.12083333); keep 6 significant digits. */
export const fmtPrice = (n: number) => {
  if (!n) return '–'
  const digits = Math.max(0, 6 - Math.floor(Math.log10(Math.abs(n))) - 1)
  return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(digits, 8) })
}

/** Order and trade sizes: two decimals under 10, whole above. */
export const fmtQty = (n: number) => fmtNum(n, n < 10 ? 2 : 0)

export const fmtPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`

export const fmtDuration = (ms: number) => {
  if (!ms) return '–'
  const m = Math.round(ms / 60e3)
  if (m < 60) return `${m}m`
  const h = m / 60
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const tone = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-muted-foreground')

/** Sizes in a narrow cell: 0.42, 37, 4.2k, 38k, 1.2M, 2.5B. Zero is blank. */
export function fmtSize(n: number) {
  const a = Math.abs(n)
  if (!a) return ''
  const s = n < 0 ? '−' : ''
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `${s}${Math.round(a / 1e3)}k`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}k`
  if (a >= 10) return `${s}${Math.round(a)}`
  return `${s}${a.toFixed(2)}`
}

/** A signed change: +4.2k, −310, 0. */
export const signedSize = (n: number) => (n > 0 ? `+${fmtSize(n)}` : fmtSize(n) || '0')

/** USD amounts: $2.51B, $940k. */
export const fmtUsd = (n: number) => (n < 0 ? `−$${fmtSize(-n)}` : `$${fmtSize(n) || '0'}`)

/** A signed USD change: +$15.7M, −$2.5M. */
export const signedUsd = (n: number) => (n > 0 ? `+${fmtUsd(n)}` : fmtUsd(n))

/** What a `datetime-local` input holds: `YYYY-MM-DDTHH:mm`. */
export const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** ms → the `YYYY-MM-DDTHH:mm` a datetime-local input speaks, in the viewer's zone. */
export const toLocalInput = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const startOfDay = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime()

export const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
