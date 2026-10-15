import { Hono } from 'hono'
import { validate } from '../validate'
import { z } from 'zod'
import { addConnection, ConnectionError, listConnections, removeConnection } from '../connections'
import { invalidatePortfolio } from './portfolio'
import { requireUser } from '../session'

const NewConnection = z.object({
  exchange: z.enum(['okx', 'binance']),
  label: z.string().max(60).optional(),
  apiKey: z.string().min(8).max(200),
  secret: z.string().min(8).max(200),
  passphrase: z.string().max(200).optional(),
  demo: z.boolean().optional(),
})

export const connections = new Hono()
  .use(requireUser)
  .get('/', async (c) => c.json(await listConnections(c.var.user.id)))
  .post('/', validate('json', NewConnection), async (c) => {
    try {
      const row = await addConnection(c.var.user.id, c.req.valid('json'))
      invalidatePortfolio(c.var.user.id)
      return c.json(row, 201)
    } catch (e) {
      if (e instanceof ConnectionError) return c.json({ error: e.message }, e.status)
      throw e
    }
  })
  .delete('/:id', async (c) => {
    try {
      await removeConnection(c.var.user.id, c.req.param('id'))
      invalidatePortfolio(c.var.user.id)
      return c.json({ ok: true })
    } catch (e) {
      if (e instanceof ConnectionError) return c.json({ error: e.message }, e.status)
      throw e
    }
  })
