import { createFileRoute } from "@tanstack/react-router"

import { db } from "@/server/db"

/** Liveness of the app and its Postgres connection. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { rows } = await db().query<{ now: string }>("select now()::text as now")
          return Response.json({ ok: true, database: "up", now: rows[0]?.now })
        } catch (cause) {
          console.error("health: database check failed", cause)
          return Response.json({ ok: false, database: "down" }, { status: 503 })
        }
      }
    }
  }
})
