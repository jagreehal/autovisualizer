import { test as base, expect } from "@playwright/test"

import { VisualizerPage } from "./pages/VisualizerPage"

interface Fixtures {
  /** Fails the test on any unexpected console error or uncaught page error. */
  errorGuard: void
  visualizer: VisualizerPage
}

// Errors a test provokes on purpose and asserts on in the UI. Keep this list narrow.
const EXPECTED: ReadonlyArray<RegExp> = [
  // embed.spec.ts blocks the embed's inline fonts to check labels fit in the fallback font.
  /Loading the font 'data:font\/woff2;.*"font-src 'none'"/
]

export const test = base.extend<Fixtures>({
  errorGuard: [
    async ({ page }, use) => {
      const errors: Array<string> = []
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console.error: ${message.text()}`)
      })
      await use()
      const unexpected = errors.filter((error) => !EXPECTED.some((pattern) => pattern.test(error)))
      expect(unexpected, `Unexpected browser errors:\n${unexpected.join("\n")}`).toEqual([])
    },
    { auto: true }
  ],
  visualizer: async ({ page }, use) => {
    // Chromium has the File System Access API; its native save dialog cannot be driven,
    // so tests take the app's download fallback instead.
    await page.addInitScript(() => {
      window.showSaveFilePicker = undefined
    })
    await use(new VisualizerPage(page))
  }
})

export { expect }
