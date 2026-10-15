import { createServerFn } from '@tanstack/react-start'
import { BARS, type Bar, type ExchangeId } from '@crypz/exchanges'
import { getAdapter } from '@crypz/exchanges/server'

type CandleQuery = { exchange: ExchangeId; symbol: string; bar: Bar; before?: number }

const SYMBOL = /^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/

function check(q: CandleQuery) {
  if (!SYMBOL.test(q.symbol)) throw new Error(`Bad symbol ${q.symbol}`)
  if (!BARS.includes(q.bar)) throw new Error(`Bad bar ${q.bar}`)
  return q
}

export const getCandles = createServerFn({ method: 'GET' })
  .validator((q: CandleQuery) => check(q))
  .handler(({ data }) => getAdapter(data.exchange).fetchCandles(data.symbol, data.bar, data.before))

export const getTicker = createServerFn({ method: 'GET' })
  .validator((q: { exchange: ExchangeId; symbol: string }) => check({ ...q, bar: '1H' }))
  .handler(({ data }) => getAdapter(data.exchange).fetchTicker(data.symbol))
