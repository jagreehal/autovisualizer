import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { defineElementsConfig } from "mountly-vite-plugin"
import { mergeConfig } from "vite"

import type { Plugin } from "vite"

const page = fileURLToPath(new URL("src/elements/page.ts", import.meta.url))

/** Put src/elements/page.ts in embed.js itself, so it runs before any chart loads. */
const pageScript: Plugin = {
  name: "autoviz-page-script",
  transform(code, id) {
    if (id === "\0virtual:mountly-embed") return `import ${JSON.stringify(page)}\n${code}`
  }
}

// Script-tag embed: /embed/embed.js registers <auto-visualizer>. Built into public/
// before the app build, so the app deploys it.
// Shadow DOM so the host page's CSS and ours stay apart.
export default mergeConfig(
  defineElementsConfig({
    prefix: "auto",
    // Load each chart as it nears the viewport: a docs page with ten charts pays for the ones read.
    elements: { visualizer: { component: "src/elements/Statechart.tsx", trigger: "viewport:200px" } },
    shadow: true
  }),
  {
    resolve: { tsconfigPaths: true },
    plugins: [tailwindcss(), pageScript],
    worker: { format: "es" },
    publicDir: false,
    build: { outDir: "public/embed" }
  }
)
