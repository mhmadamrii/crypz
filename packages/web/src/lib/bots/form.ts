import { BAR_MS, type Bar } from '@crypz/exchanges'
import { DEFAULT_CONFIG, type BotConfig } from './types'

// The bots form as text, and the rules for turning it into a config. Kept apart from the page so it can be tested.

export const MAX_DAYS = 31
const DAY = 86_400_000

/** Every field as the user typed it. Percent fields are in percent, dates are UTC days (YYYY-MM-DD). */
export type BotForm = {
  symbol: string
  entryBar: Bar
  trendBar: Bar
  start: string
  end: string
  equity: string
  riskPct: string
  rr: string
  feePct: string
  slippageBps: string
  maxLeverage: string
  emaFast: string
  emaMid: string
  emaSlow: string
  rsiPeriod: string
  rsiTrigger: string
  atrPeriod: string
  volumePeriod: string
  swingLookback: string
  slAtrBuffer: string
  pullbackAtr: string
  minStopAtr: string
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function defaultForm(symbol: string, now = Date.now()): BotForm {
  const d = DEFAULT_CONFIG
  const today = Math.floor(now / DAY) * DAY
  return {
    symbol,
    entryBar: d.entryBar,
    trendBar: d.trendBar,
    start: day(today - 14 * DAY),
    end: day(today - DAY),
    equity: String(d.initialEquity),
    riskPct: String(d.riskPct),
    rr: d.rr.toFixed(1),
    feePct: String(d.feeRate * 100),
    slippageBps: String(d.slippageBps),
    maxLeverage: String(d.maxLeverage),
    emaFast: String(d.emaFast),
    emaMid: String(d.emaMid),
    emaSlow: String(d.emaSlow),
    rsiPeriod: String(d.rsiPeriod),
    rsiTrigger: String(d.rsiTrigger),
    atrPeriod: String(d.atrPeriod),
    volumePeriod: String(d.volumePeriod),
    swingLookback: String(d.swingLookback),
    slAtrBuffer: String(d.slAtrBuffer),
    pullbackAtr: String(d.pullbackAtr),
    minStopAtr: String(d.minStopAtr),
  }
}

const dayMs = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : Number.NaN)

export type Parsed = { ok: true; config: BotConfig } | { ok: false; errors: string[] }

/** The end day is included: the window ends at the start of the day after it. */
export function parseForm(f: BotForm, now = Date.now()): Parsed {
  const errors: string[] = []
  const n = (label: string, v: string, ok: (x: number) => boolean, hint: string) => {
    const x = v.trim() === '' ? Number.NaN : Number(v)
    if (!Number.isFinite(x) || !ok(x)) {
      errors.push(`${label}: ${hint}.`)
      return 0
    }
    return x
  }
  const pos = (x: number) => x > 0
  const int = (x: number) => Number.isInteger(x) && x >= 1

  const startMs = dayMs(f.start)
  const endMs = dayMs(f.end) + DAY
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) errors.push('Dates: pick a start and an end date.')
  else {
    if (endMs <= startMs) errors.push('Dates: the end must not be before the start.')
    if (endMs - DAY > now) errors.push('Dates: the end cannot be in the future.')
    if ((endMs - startMs) / DAY > MAX_DAYS)
      errors.push(`Dates: at most ${MAX_DAYS} days per run, so the candle download stays reasonable.`)
  }
  if (BAR_MS[f.trendBar] <= BAR_MS[f.entryBar])
    errors.push('Timeframes: the trend timeframe must be longer than the entry one.')
  if (!f.symbol) errors.push('Instrument: pick one.')

  const config: BotConfig = {
    symbol: f.symbol,
    entryBar: f.entryBar,
    trendBar: f.trendBar,
    startMs,
    endMs,
    initialEquity: n('Initial equity', f.equity, pos, 'enter an amount above 0'),
    riskPct: n('Risk per trade', f.riskPct, (x) => x > 0 && x <= 100, 'between 0 and 100%'),
    rr: n('Risk:reward', f.rr, pos, 'above 0'),
    feeRate: n('Fee', f.feePct, (x) => x >= 0 && x < 5, 'a percent from 0 to 5') / 100,
    slippageBps: n('Slippage', f.slippageBps, (x) => x >= 0 && x <= 500, 'basis points from 0 to 500'),
    maxLeverage: n('Max leverage', f.maxLeverage, (x) => x >= 1, '1 or more'),
    emaFast: n('Fast EMA', f.emaFast, int, 'a whole number'),
    emaMid: n('Mid EMA', f.emaMid, int, 'a whole number'),
    emaSlow: n('Slow EMA', f.emaSlow, int, 'a whole number'),
    rsiPeriod: n('RSI period', f.rsiPeriod, int, 'a whole number'),
    rsiTrigger: n('RSI trigger', f.rsiTrigger, (x) => x > 0 && x < 100, 'between 0 and 100'),
    atrPeriod: n('ATR period', f.atrPeriod, int, 'a whole number'),
    volumePeriod: n('Volume average', f.volumePeriod, int, 'a whole number'),
    swingLookback: n('Swing lookback', f.swingLookback, int, 'a whole number of candles'),
    slAtrBuffer: n('Stop buffer', f.slAtrBuffer, (x) => x >= 0, '0 or more ATRs'),
    pullbackAtr: n('Pullback reach', f.pullbackAtr, (x) => x >= 0, '0 or more ATRs'),
    minStopAtr: n('Minimum stop', f.minStopAtr, (x) => x >= 0, '0 or more ATRs'),
  }
  if (!errors.length && !(config.emaFast < config.emaMid && config.emaMid < config.emaSlow))
    errors.push('EMA periods: must increase, fast < mid < slow.')
  return errors.length ? { ok: false, errors } : { ok: true, config }
}

/** How many candles an indicator needs before its first value, to size the warm-up download. */
export const warmupBars = (c: Pick<BotConfig, 'emaSlow' | 'emaMid' | 'rsiPeriod' | 'atrPeriod' | 'volumePeriod'>) => ({
  trend: c.emaSlow + 60,
  entry: Math.max(c.emaMid, c.rsiPeriod, c.atrPeriod, c.volumePeriod) + 60,
})
