import { loadEnvFile } from 'node:process'
import { defineConfig, env } from 'prisma/config'

// The monorepo keeps one .env at the root; in production the variables come from the container instead.
try {
  loadEnvFile(new URL('../../.env', import.meta.url))
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
