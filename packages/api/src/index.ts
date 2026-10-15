import { app } from './app'
import { assertCredentialsKey } from './crypto'

assertCredentialsKey()

const port = Number(process.env['PORT'] ?? 3001)
console.log(`[api] listening on :${port}`)

export default { port, fetch: app.fetch }
