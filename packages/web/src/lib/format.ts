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
