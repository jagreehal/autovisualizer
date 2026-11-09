import { createAuthClient } from "@neon/auth"
import { BetterAuthReactAdapter } from "@neon/auth/react/adapters"

const createClient = (url: string) =>
  createAuthClient(url, { adapter: BetterAuthReactAdapter({ fetchOptions: { credentials: "include" } }) })

export type AuthClient = ReturnType<typeof createClient>

/**
 * Browser client for Neon Auth (Managed Better Auth), talking to the branch's Auth URL.
 * `undefined` when the build has no Neon Auth URL (CI, forks): the app then runs local-only.
 */
export const authClient: AuthClient | undefined = import.meta.env.VITE_NEON_AUTH_URL
  ? createClient(import.meta.env.VITE_NEON_AUTH_URL)
  : undefined

interface TokenResponse {
  readonly token: string
}

/**
 * Call our own API as the signed-in user. Neon Auth's JWT endpoint (`GET /token`, from
 * Better Auth's JWT plugin) turns the session cookie into a 15-minute token our server
 * verifies. A plain fetch: the Better Auth client's `$fetch` does not send this request.
 */
export async function fetchAsUser(path: string): Promise<Response> {
  const response = await fetch(`${import.meta.env.VITE_NEON_AUTH_URL}/token`, { credentials: "include" })
  const body: TokenResponse | undefined = response.ok ? await response.json() : undefined
  return fetch(path, { headers: body ? { authorization: `Bearer ${body.token}` } : {} })
}
