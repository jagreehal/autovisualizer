import { createRemoteJWKSet, jwtVerify } from "jose"

import { neonEnv } from "./env"

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

/**
 * The signed-in user's id from an `Authorization: Bearer <jwt>` header, verified against
 * the Neon Auth JWKS, or `undefined` when the request carries no valid token.
 */
export async function userIdFrom(request: Request): Promise<string | undefined> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]
  if (token === undefined) return undefined
  const { auth } = neonEnv()
  jwks ??= createRemoteJWKSet(new URL(auth.jwksUrl))
  try {
    const origin = new URL(auth.baseUrl).origin
    const { payload } = await jwtVerify(token, jwks, { issuer: origin, audience: origin })
    return payload.sub
  } catch {
    return undefined
  }
}
