import type { ZodType } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'

/** zValidator with the API's error shape: `{ error }` and a 400, like every other failure. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (r, c) => {
    if (!r.success) return c.json({ error: r.error.issues[0]?.message ?? 'Invalid input' }, 400)
  })
