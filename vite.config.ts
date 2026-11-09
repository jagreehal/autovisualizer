import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // Deployment target. Nitro picks the preset from the environment: Vercel on
    // `vercel build`, plain Node elsewhere. Kept so auth/server functions can land later.
    nitro(),
    viteReact()
  ],
  worker: { format: "es" }
})
