import { loadEnvFile } from 'node:process'
import { defineConfig } from 'prisma/config'

// The monorepo keeps one .env at the root; in production the variables come from the container instead.
try {
  loadEnvFile(new URL('../../.env', import.meta.url))
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` never connects, so it runs without DATABASE_URL (e.g. the web build on Vercel installs the
  // whole workspace). migrate/studio still need it and fail loudly when it is missing.
  ...(process.env['DATABASE_URL'] ? { datasource: { url: process.env['DATABASE_URL'] } } : {}),
})
