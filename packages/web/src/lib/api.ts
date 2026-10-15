import { hc, parseResponse, type ClientResponse } from 'hono/client'
import type { AppType } from '@crypz/api'

// Typed client for the Hono API (packages/api). Session cookies ride along on every call.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const api = hc<AppType>(API_URL, { init: { credentials: 'include' } })

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Await a typed call; non-2xx responses throw ApiError carrying the API's `{ error }` message. */
export async function unwrap<T extends ClientResponse<unknown>>(call: Promise<T>) {
  const res = await call
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status)
  }
  return parseResponse(res)
}
