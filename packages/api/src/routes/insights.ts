import { Hono } from 'hono'
import { z } from 'zod'
import { generateInsights, insightsConfigured, type InsightsResult } from '../insights'
import { requireUser } from '../session'
import { validate } from '../validate'
import { portfolioFor } from './portfolio'

// AI insights over the signed-in user's own history, in the scope the dashboard is showing. An answer is kept until
// the history changes (a new close), so reopening the page costs nothing; each user gets a few fresh reads an hour.

const TTL = 6 * 60 * 60_000
const PER_HOUR = 10
const cache = new Map<string, { at: number; value: Promise<InsightsResult> }>()
const recent = new Map<string, number[]>()

const Scope = z.object({
  exchange: z.enum(['okx', 'binance']),
  days: z.number().int().positive().max(3650).nullable(),
  asset: z.string().trim().toUpperCase().max(20).nullable(),
})

export const insights = new Hono()
  .use(requireUser)
  .get('/status', (c) => c.json({ configured: insightsConfigured() }))
  .post('/', validate('json', Scope), async (c) => {
    if (!insightsConfigured()) return c.json({ error: 'AI insights are not set up on this server yet.' }, 503)
    const userId = c.var.user.id
    const scope = c.req.valid('json')
    const data = await portfolioFor(userId)
    const from = scope.days ? data.fetchedAt - scope.days * 864e5 : 0
    const positions = data.positions.filter(
      (p) => p.exchange === scope.exchange && p.closedAt >= from && (!scope.asset || p.base === scope.asset),
    )

    // same scope and the same closes as last time: same answer
    const key = `${userId}|${scope.exchange}|${scope.days}|${scope.asset}|${positions.length}|${positions[0]?.id ?? ''}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) return c.json(await hit.value)

    const times = (recent.get(userId) ?? []).filter((t) => Date.now() - t < 60 * 60_000)
    if (times.length >= PER_HOUR) return c.json({ error: 'That is the hourly limit for AI reads. Try again later.' }, 429)
    recent.set(userId, [...times, Date.now()])

    const value = generateInsights(positions, scope)
    cache.set(key, { at: Date.now(), value })
    value.catch(() => cache.delete(key))
    try {
      return c.json(await value)
    } catch (e) {
      console.error(`[insights] ${e instanceof Error ? e.message : e}`)
      return c.json({ error: 'Gemini did not answer. Try again in a minute.' }, 502)
    }
  })
