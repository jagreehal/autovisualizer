import { defineConfig } from "vite"

// The review CLI as one Node file, its dependencies bundled in, so the GitHub Action runs
// it with plain `node` and no install in the reviewed repository.
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true, target: "node" },
  build: {
    ssr: "src/review/cli.ts",
    outDir: "dist/review",
    target: "node24",
    rollupOptions: { output: { entryFileNames: "cli.mjs" } }
  }
})
