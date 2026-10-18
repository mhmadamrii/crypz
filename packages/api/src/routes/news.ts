import { Hono } from 'hono'
import { marketNews } from '../news'
import { requireUser } from '../session'

// Market news for signed-in users. The feeds are public; the gate keeps the API from being an open RSS proxy.
export const news = new Hono().use(requireUser).get('/', async (c) => c.json(await marketNews()))
