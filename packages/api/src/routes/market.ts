import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { validate } from '../validate'
import { z } from 'zod'
import { BARS, LONG_SHORT_KINDS, STAT_BARS } from '@crypz/exchanges'
import { getAdapter } from '@crypz/exchanges/server'
import { FIRST_DAY, footprintDay } from '../footprint'
import { requireUser } from '../session'

// Public market data, proxied so every OKX call leaves from the server's fixed IP. Signed-in users only,
// so the API is not an open proxy.
const symbol = z.string().regex(/^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/)
const exchange = z.enum(['okx', 'binance'])

export const market = new Hono()
  .use(requireUser)
  .get(
    '/candles',
    validate(
      'query',
      z.object({ exchange, symbol, bar: z.enum(BARS), before: z.coerce.number().int().positive().optional() }),
    ),
    async (c) => {
      const q = c.req.valid('query')
      return c.json(await getAdapter(q.exchange).fetchCandles(q.symbol, q.bar, q.before))
    },
  )
  .get('/ticker', validate('query', z.object({ exchange, symbol })), async (c) => {
    const q = c.req.valid('query')
    return c.json(await getAdapter(q.exchange).fetchTicker(q.symbol))
  })
  .get('/taker-flow', validate('query', z.object({ exchange, symbol, bar: z.enum(STAT_BARS) })), async (c) => {
    const q = c.req.valid('query')
    return c.json(await getAdapter(q.exchange).fetchTakerFlow(q.symbol, q.bar))
  })
  .get('/open-interest', validate('query', z.object({ exchange, symbol, bar: z.enum(STAT_BARS) })), async (c) => {
    const q = c.req.valid('query')
    return c.json(await getAdapter(q.exchange).fetchOpenInterest(q.symbol, q.bar))
  })
  .get(
    '/long-short',
    validate('query', z.object({ exchange, symbol, bar: z.enum(STAT_BARS), kind: z.enum(LONG_SHORT_KINDS) })),
    async (c) => {
      const q = c.req.valid('query')
      return c.json(await getAdapter(q.exchange).fetchLongShort(q.symbol, q.bar, q.kind))
    },
  )
  .get('/liquidations', validate('query', z.object({ exchange, symbol })), async (c) => {
    const q = c.req.valid('query')
    return c.json(await getAdapter(q.exchange).fetchLiquidations(q.symbol))
  })
  .get('/premium', validate('query', z.object({ exchange, symbol })), async (c) => {
    const q = c.req.valid('query')
    return c.json(await getAdapter(q.exchange).fetchPremium(q.symbol))
  })
  // One OKX day (UTC+8) of footprint bars, built from the exchange's trade file on first request. Compressed: a
  // busy day is a megabyte or two of JSON.
  .get(
    '/footprint',
    validate(
      'query',
      z.object({
        exchange: z.literal('okx', { error: 'Footprint history comes from OKX only.' }),
        symbol,
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((d) => d >= FIRST_DAY, `OKX trade files before ${FIRST_DAY} cannot tell buyers from sellers.`),
        retry: z.literal('1').optional(),
      }),
    ),
    compress(),
    async (c) => {
      const q = c.req.valid('query')
      return c.json(await footprintDay(q.symbol, q.day, q.retry === '1'))
    },
  )
