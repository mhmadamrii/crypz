import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@crypz/db'
import { requireUser } from '../session'
import { validate } from '../validate'

// A workspace's state is the web app's business (which widgets exist and how they render); the api only checks
// its shape and size, so a client can never store something unbounded.
const symbol = z.string().regex(/^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/)
const link = z.union([z.literal(1), z.literal(2), z.literal(3), z.null()])

const WidgetConfig = z.object({
  id: z.string().min(1).max(40),
  kind: z.string().min(1).max(30),
  link,
  /** Own symbol when unlinked. */
  symbol: symbol.optional(),
  settings: z.record(z.string(), z.union([z.string().max(40), z.number(), z.boolean()])).optional(),
})

const LayoutItem = z.object({
  i: z.string().min(1).max(40),
  x: z.number().int().min(0).max(48),
  y: z.number().int().min(0).max(500),
  w: z.number().int().min(1).max(48),
  h: z.number().int().min(1).max(200),
})

export const WorkspaceState = z.object({
  v: z.literal(1),
  widgets: z.array(WidgetConfig).max(40),
  layout: z.array(LayoutItem).max(40),
  links: z.object({ '1': symbol, '2': symbol, '3': symbol }),
})
export type WorkspaceStateT = z.infer<typeof WorkspaceState>

const name = z.string().trim().min(1).max(40)
const select = { id: true, name: true, position: true, state: true, updatedAt: true } as const
const shape = (w: { id: string; name: string; position: number; state: unknown; updatedAt: Date }) => ({
  ...w,
  state: w.state as WorkspaceStateT,
})

export const workspaces = new Hono()
  .use(requireUser)
  .get('/', async (c) => {
    const rows = await db().workspace.findMany({
      where: { userId: c.var.user.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select,
    })
    return c.json(rows.map(shape))
  })
  .post('/', validate('json', z.object({ name, state: WorkspaceState })), async (c) => {
    const { name, state } = c.req.valid('json')
    const userId = c.var.user.id
    if ((await db().workspace.count({ where: { userId } })) >= 12)
      return c.json({ error: 'You can keep up to 12 workspaces.' }, 400)
    const last = await db().workspace.findFirst({ where: { userId }, orderBy: { position: 'desc' } })
    const row = await db().workspace.create({
      data: { id: randomUUID(), userId, name, state, position: (last?.position ?? -1) + 1 },
      select,
    })
    return c.json(shape(row), 201)
  })
  .put('/:id', validate('json', z.object({ name: name.optional(), state: WorkspaceState.optional() })), async (c) => {
    const body = c.req.valid('json')
    const { count } = await db().workspace.updateMany({
      where: { id: c.req.param('id'), userId: c.var.user.id },
      data: body,
    })
    if (!count) return c.json({ error: 'Workspace not found.' }, 404)
    return c.json({ ok: true })
  })
  .delete('/:id', async (c) => {
    const { count } = await db().workspace.deleteMany({ where: { id: c.req.param('id'), userId: c.var.user.id } })
    if (!count) return c.json({ error: 'Workspace not found.' }, 404)
    return c.json({ ok: true })
  })
