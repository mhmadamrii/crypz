// One-off: move the OKX key from the root .env into the database for an existing user, sealed like any other.
// Usage: pnpm --filter @crypz/api import-okx-env <email>
import { db } from '@crypz/db'
import { addConnection, ConnectionError } from '../src/connections'

const email = process.argv[2]
if (!email) throw new Error('Usage: import-okx-env <email>')

const user = await db().user.findUnique({ where: { email } })
if (!user) throw new Error(`No user ${email}. Sign up in the app first.`)

const get = (k: string) => process.env[k] || ''
try {
  const row = await addConnection(user.id, {
    exchange: 'okx',
    label: 'OKX (from .env)',
    apiKey: get('OKX_API_KEY'),
    secret: get('OKX_API_SECRET'),
    passphrase: get('OKX_API_PASSPHRASE'),
    demo: get('OKX_DEMO') === '1',
  })
  console.log(`Connected ${row.label} (…${row.keyHint}, ${row.permissions.join(', ')}) for ${email}.`)
  console.log('You can now remove OKX_API_KEY, OKX_API_SECRET and OKX_API_PASSPHRASE from .env.')
} catch (e) {
  console.error(e instanceof ConnectionError ? e.message : e)
  process.exitCode = 1
} finally {
  await db().$disconnect()
}
