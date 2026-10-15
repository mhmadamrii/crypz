import { Hono } from 'hono'
import { validate } from '../validate'
import { z } from 'zod'
import { BARS } from '@crypz/exchanges'
import { getAdapter } from '@crypz/exchanges/server'
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
