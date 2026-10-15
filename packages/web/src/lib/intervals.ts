import { useSyncExternalStore } from 'react'
import { BARS, type Bar } from '@crypz/exchanges'

// Which intervals the timeframe bar shows. A per-browser preference, so it lives in localStorage.

export const DEFAULT_INTERVALS: readonly Bar[] = ['15m', '1H', '4H', '1D']

const KEY = 'crypz-intervals'
const listeners = new Set<() => void>()
let cache: { raw: string | null; value: readonly Bar[] } = { raw: null, value: DEFAULT_INTERVALS }

function read(): readonly Bar[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return cache.value
  }
  if (raw === cache.raw) return cache.value
  let value = DEFAULT_INTERVALS
  try {
    const picked = new Set(JSON.parse(raw ?? 'null') as string[])
    const valid = BARS.filter((b) => picked.has(b))
    if (valid.length) value = valid
  } catch {}
  cache = { raw, value }
  return value
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => e.key === KEY && fn()
  window.addEventListener('storage', onStorage) // other tabs
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

function write(value: readonly Bar[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {}
  cache = { raw: JSON.stringify(value), value }
  for (const fn of listeners) fn()
}

/** Selected intervals in canonical order (shortest first), and a toggle that never empties the list. */
export function useIntervals() {
  const selected = useSyncExternalStore(subscribe, read, () => DEFAULT_INTERVALS)
  const toggle = (bar: Bar) => {
    const next = selected.includes(bar)
      ? selected.filter((b) => b !== bar)
      : BARS.filter((b) => b === bar || selected.includes(b))
    if (next.length) write(next)
  }
  const reset = () => write(DEFAULT_INTERVALS)
  return { selected, toggle, reset }
}
