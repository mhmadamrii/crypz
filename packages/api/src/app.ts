import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { auth } from './auth'
import { env } from './env'
import { connections } from './routes/connections'
import { market } from './routes/market'
import { news } from './routes/news'
import { portfolio } from './routes/portfolio'
import { workspaces } from './routes/workspaces'

export const app = new Hono()
  .use(secureHeaders())
  .use(
    cors({
      origin: env('WEB_ORIGIN'),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  )
  .on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/market', market)
  .route('/news', news)
  .route('/portfolio', portfolio)
  .route('/connections', connections)
  .route('/workspaces', workspaces)
  .onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    // log the failure, never the request body: it may carry credentials
    console.error(`[api] ${c.req.method} ${c.req.path}:`, err.message)
    return c.json({ error: 'Something went wrong on our side.' }, 500)
  })

export type { WorkspaceStateT } from './routes/workspaces'

/** Route types for the web app's typed `hc` client. */
export type AppType = typeof app
