import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readClock, subscribeClock } from './kit'

describe('the shared clock', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // useSyncExternalStore re-checks the snapshot after it subscribes. If subscribing moved the clock, every render
  // would cause another one and React would give up (#185).
  it('does not change its reading when something subscribes or leaves', () => {
    const before = readClock()
    vi.advanceTimersByTime(500)
    const stop = subscribeClock(() => {})
    expect(readClock()).toBe(before)
    stop()
    const again = subscribeClock(() => {})
    expect(readClock()).toBe(before)
    again()
  })

  it('ticks every second for every listener on one timer, and stops with the last', () => {
    const a = vi.fn()
    const b = vi.fn()
    const stopA = subscribeClock(a)
    const stopB = subscribeClock(b)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    expect(readClock()).toBeGreaterThan(0)
    stopA()
    expect(vi.getTimerCount()).toBe(1)
    stopB()
    expect(vi.getTimerCount()).toBe(0)
  })
})
