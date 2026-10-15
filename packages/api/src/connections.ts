import { randomUUID } from 'node:crypto'
import { db } from '@crypz/db'
import type { Credentials, ExchangeId } from '@crypz/exchanges'
import { getAdapter } from '@crypz/exchanges/server'
import { seal, unseal } from './crypto'

// Everything that touches decrypted credentials lives here. Plaintext never leaves this module except as the
// argument to an exchange adapter call, and it is never logged or returned to a client.

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message)
  }
}

const aad = (userId: string, id: string) => `${userId}:${id}`

export type NewConnection = { exchange: ExchangeId; label?: string } & Credentials

/** Verify the key with the exchange, refuse anything that can trade or withdraw, then store it sealed. */
export async function addConnection(userId: string, input: NewConnection) {
  const adapter = getAdapter(input.exchange)
  if (!adapter.available) throw new ConnectionError(`${adapter.name} is not supported yet.`)
  if (adapter.needsPassphrase && !input.passphrase)
    throw new ConnectionError(`${adapter.name} keys need the passphrase.`)

  const credentials: Credentials = {
    apiKey: input.apiKey.trim(),
    secret: input.secret.trim(),
    passphrase: input.passphrase?.trim(),
    demo: input.demo,
  }
  let check
  try {
    check = await adapter.verifyKey(credentials)
  } catch (e) {
    throw new ConnectionError(`${adapter.name} rejected the key: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!check.readOnly)
    throw new ConnectionError(
      `This key has ${check.permissions.join(', ')} permission. crypz only accepts read-only keys: create one with "Read" only.`,
    )

  const id = randomUUID()
  const keyHint = credentials.apiKey.slice(-4)
  try {
    return await db().exchangeConnection.create({
      data: {
        id,
        userId,
        exchange: input.exchange,
        label: input.label?.trim() || `${adapter.name} ${keyHint}`,
        keyHint,
        demo: Boolean(input.demo),
        permissions: check.permissions,
        sealed: seal(JSON.stringify(credentials), aad(userId, id)),
      },
      select: publicFields,
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new ConnectionError('That key is already connected.', 409)
    throw e
  }
}

export const publicFields = {
  id: true,
  exchange: true,
  label: true,
  keyHint: true,
  demo: true,
  permissions: true,
  lastUsedAt: true,
  createdAt: true,
} as const

export const listConnections = (userId: string) =>
  db().exchangeConnection.findMany({ where: { userId }, select: publicFields, orderBy: { createdAt: 'asc' } })

export async function removeConnection(userId: string, id: string) {
  const { count } = await db().exchangeConnection.deleteMany({ where: { id, userId } })
  if (!count) throw new ConnectionError('Connection not found.', 404)
}

/** Decrypted credentials for every connection the user has, for the length of one request. */
export async function credentialsFor(userId: string) {
  const rows = await db().exchangeConnection.findMany({ where: { userId } })
  if (rows.length) await db().exchangeConnection.updateMany({ where: { userId }, data: { lastUsedAt: new Date() } })
  return rows.map((r) => ({
    exchange: r.exchange as ExchangeId,
    credentials: JSON.parse(unseal(r.sealed, aad(userId, r.id))) as Credentials,
  }))
}
