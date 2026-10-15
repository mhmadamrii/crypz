import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from '@crypz/db'
import { env, isProd, optionalEnv } from './env'

// Email + password sessions stored in Postgres. In production web and api share a parent domain
// (app. / api.), so the session cookie is scoped to it via COOKIE_DOMAIN.
const cookieDomain = optionalEnv('COOKIE_DOMAIN')

export const auth = betterAuth({
  database: prismaAdapter(db(), { provider: 'postgresql' }),
  secret: env('BETTER_AUTH_SECRET'),
  baseURL: env('BETTER_AUTH_URL'),
  basePath: '/auth',
  trustedOrigins: [env('WEB_ORIGIN')],
  emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
  advanced: {
    useSecureCookies: isProd(),
    ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
  },
})

export type SessionUser = typeof auth.$Infer.Session.user
