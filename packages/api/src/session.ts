import { createMiddleware } from 'hono/factory'
import { auth, type SessionUser } from './auth'

/** Rejects the request unless it carries a valid session cookie; exposes the user as `c.var.user`. */
export const requireUser = createMiddleware<{ Variables: { user: SessionUser } }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Sign in first.' }, 401)
  c.set('user', session.user)
  await next()
})
