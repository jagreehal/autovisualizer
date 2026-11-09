import { attachDatabasePool } from "@vercel/functions"
import pg from "pg"

import { neonEnv } from "./env"

let pool: pg.Pool | undefined

/**
 * One node-postgres pool per server instance, on the pooled Neon URL. On Vercel Fluid
 * compute, attachDatabasePool closes idle clients before the instance suspends.
 */
export function db(): pg.Pool {
  if (pool === undefined) {
    // Neon URLs say sslmode=require; pg 9 will read that as "verify nothing", so ask for
    // full certificate verification explicitly (Neon certificates chain to public CAs).
    const connectionString = neonEnv().postgres.databaseUrl.replace("sslmode=require", "sslmode=verify-full")
    pool = new pg.Pool({ connectionString, max: 5 })
    attachDatabasePool(pool)
  }
  return pool
}
