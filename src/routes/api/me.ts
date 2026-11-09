import { createFileRoute } from "@tanstack/react-router"

import { db } from "@/server/db"
import { userIdFrom } from "@/server/session"

interface UserRow {
  readonly id: string
  readonly name: string
  readonly email: string
}

/**
 * The signed-in user, read from the `neon_auth.user` table that Neon Auth keeps in this
 * branch's Postgres. Requires a Neon Auth JWT; anything else gets a 401.
 */
export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await userIdFrom(request)
        if (userId === undefined) return Response.json({ error: "Unauthorized" }, { status: 401 })
        const { rows } = await db().query<UserRow>(`select id, name, email from neon_auth."user" where id = $1`, [
          userId
        ])
        const user = rows[0]
        if (user === undefined) return Response.json({ error: "Unknown user" }, { status: 404 })
        return Response.json({ user })
      }
    }
  }
})
