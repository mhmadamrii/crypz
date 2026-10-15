import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env, optionalEnv } from './env'

// Exchange credentials at rest: AES-256-GCM with a 32-byte master key that lives only in the server's env.
// Each box carries its key version, so keys can rotate: v1 reads CREDENTIALS_KEY, vN reads CREDENTIALS_KEY_V<N>.
// The additional data binds a box to its row (`userId:connectionId`), so a copied box fails to open elsewhere.

const b64u = (b: Buffer) => b.toString('base64url')

function masterKey(version: number) {
  const raw = env(version === 1 ? 'CREDENTIALS_KEY' : `CREDENTIALS_KEY_V${version}`)
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error(`Credentials key v${version} must be 32 bytes (base64)`)
  return key
}

const writeVersion = () => Number(optionalEnv('CREDENTIALS_KEY_VERSION') ?? 1)

export function seal(plain: string, aad: string) {
  const version = writeVersion()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey(version), iv)
  cipher.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `v${version}.${b64u(iv)}.${b64u(cipher.getAuthTag())}.${b64u(ct)}`
}

export function unseal(box: string, aad: string) {
  const [v, iv, tag, ct] = box.split('.')
  const version = Number(v?.slice(1))
  if (!version || !iv || !tag || !ct) throw new Error('Malformed credentials box')
  const decipher = createDecipheriv('aes-256-gcm', masterKey(version), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}

/** Fail at boot, not on the first request, when the master key is missing or the wrong size. */
export function assertCredentialsKey() {
  masterKey(writeVersion())
}
