import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // `neon deploy` writes the Neon variables to .env.local. The dev server's API routes read
  // them from process.env, and the browser gets the one public value, the Auth URL.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) process.env[key] ??= value
  return {
    define: { "import.meta.env.VITE_NEON_AUTH_URL": JSON.stringify(process.env.NEON_AUTH_BASE_URL ?? "") },
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      tanstackStart(),
      // Deployment target. Nitro picks the preset from the environment: Vercel on
      // `vercel build`, plain Node elsewhere. Serves the /api routes.
      nitro(),
      viteReact()
    ],
    worker: { format: "es" }
  }
})
