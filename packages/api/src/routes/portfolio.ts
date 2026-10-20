import { Hono } from 'hono'
import { loadPortfolio, type Portfolio } from '@crypz/exchanges/server'
import { credentialsFor } from '../connections'
import { requireUser } from '../session'

// Exchange history barely moves between page loads; a short per-user cache keeps OKX rate limits out of reach.
const TTL = 30_000
const cache = new Map<string, { at: number; value: Promise<Portfolio> }>()

export const invalidatePortfolio = (userId: string) => cache.delete(userId)

/** The user's portfolio through the short cache; `fresh` skips it. Shared with the insights route. */
export function portfolioFor(userId: string, fresh = false) {
  const hit = cache.get(userId)
  if (!hit || Date.now() - hit.at > TTL || fresh) {
    const value = credentialsFor(userId).then(loadPortfolio)
    cache.set(userId, { at: Date.now(), value })
    value.catch(() => cache.delete(userId))
  }
  return cache.get(userId)!.value
}

export const portfolio = new Hono()
  .use(requireUser)
  .get('/', async (c) => c.json(await portfolioFor(c.var.user.id, c.req.query('fresh') === '1')))
