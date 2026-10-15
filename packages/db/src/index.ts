import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client'

export * from './generated/client'

/** One client per process. Reads DATABASE_URL at first use, so importing this module never needs the env. */
let client: PrismaClient | undefined

export function db() {
  if (!client) {
    const url = process.env['DATABASE_URL']
    if (!url) throw new Error('Missing env var DATABASE_URL')
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  }
  return client
}
