import { parseEnv } from "@neon/env"

import config from "../../neon"

/**
 * The Neon variables the server reads, validated against neon.ts. `neon deploy` and
 * `neon env pull` write them to `.env.local`; on Vercel they are project env vars.
 */
export const neonEnv = () => parseEnv(config, ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_JWKS_URL"])
