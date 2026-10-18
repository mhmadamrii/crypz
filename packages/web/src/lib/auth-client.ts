import { createAuthClient } from 'better-auth/react'
import { API_URL } from './api'

export const authClient = createAuthClient({ baseURL: `${API_URL}/auth` })

/** Where a signed-in visitor lands after logging in (the public pages' "Open dashboard" links to the same page). */
export const APP_HOME = '/okx/overview'

/**
 * Whether someone is signed in, for public pages that change their calls to action. The session cookie belongs to
 * the API's domain, so only the browser can tell: on the server and until the check returns this is false, and
 * the page shows its signed-out labels.
 */
export function useSignedIn() {
  const { data } = authClient.useSession()
  return !!data
}
