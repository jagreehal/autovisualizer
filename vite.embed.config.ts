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

/**
 * Put the stylesheet in the chart's chunk as text, instead of the `cssUrl` mountly points at it. mountly fetches a
 * `cssUrl` at runtime, which a page whose Content Security Policy only allows scripts from the CDN blocks, leaving the
 * chart unstyled. Given `styles`, it adopts them into each shadow root with nothing to fetch.
 *
 * Runs after mountly's own `generateBundle`, which writes the `cssUrl`.
 */
const inlineStyles: Plugin = {
  name: "autoviz-inline-styles",
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const stylesheets = Object.values(bundle).filter((output) => output.fileName.endsWith(".css"))
      if (stylesheets.length !== 1) throw new Error(`Expected one stylesheet in the embed, found ${stylesheets.length}`)
      const [sheet] = stylesheets
      if (sheet?.type !== "asset") return
      const name = sheet.fileName.split("/").at(-1) ?? ""
      const cssUrl = new RegExp(
        String.raw`cssUrl:\s*new URL\((["'])\./${name.replace(/\W/g, "\\$&")}\1,\s*import\.meta\.url\)\.href`
      )
      const chunks = Object.values(bundle).filter((output) => output.type === "chunk" && cssUrl.test(output.code))
      if (chunks.length === 0) throw new Error(`No chunk loads ${sheet.fileName}; mountly's cssUrl output changed`)
      for (const chunk of chunks) {
        if (chunk.type === "chunk")
          chunk.code = chunk.code.replace(cssUrl, `styles:${JSON.stringify(String(sheet.source))}`)
      }
      delete bundle[sheet.fileName]
    }
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
    plugins: [tailwindcss(), pageScript, inlineStyles],
    worker: { format: "es" },
    publicDir: false,
    build: { outDir: "public/embed" }
  }
)
