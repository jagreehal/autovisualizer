import { mkdir, readFile, writeFile } from "node:fs/promises"

import { expect, test } from "./fixtures"

/**
 * The exported SVGs, byte for byte. A diff here is a change to what a reader sees, so read it
 * before accepting it: re-record with UPDATE_GOLDENS=1, then review the changed files.
 * Chromium measures text a pixel apart on macOS and Linux, so each platform has its own set.
 */
const GOLDENS = `e2e/goldens/${process.platform}`

async function matchesGolden(name: string, svg: string) {
  const path = `${GOLDENS}/${name}`
  if (process.env.UPDATE_GOLDENS) {
    await mkdir(GOLDENS, { recursive: true })
    await writeFile(path, svg)
  }
  const golden = await readFile(path, "utf8").catch(() => undefined)
  if (svg !== golden) {
    // Keep what this platform drew: CI uploads test-results/, so the Linux set can be recorded from a Mac.
    await mkdir(`test-results/${GOLDENS}`, { recursive: true })
    await writeFile(`test-results/${path}`, svg)
  }
  expect(svg, `${path} changed; re-record with UPDATE_GOLDENS=1 and review the diff`).toBe(golden)
}

test.describe("SVG export", () => {
  for (const example of ["checkout", "approval", "parallel"]) {
    test(`${example} exports the same SVG every time`, async ({ visualizer }) => {
      await visualizer.goto()
      await visualizer.sidebar.loadExample(example)
      await expect(visualizer.summary).toContainText(example === "parallel" ? "release" : example)

      const { name, text } = await visualizer.saveAs(/SVG image/)

      expect(name).toMatch(/\.svg$/)
      await matchesGolden(`${example}.svg`, text)
    })
  }

  test("the animated SVG steps through what was simulated", async ({ visualizer }) => {
    await visualizer.goto()
    for (const event of ["ADD_ITEM", "CHECKOUT"]) await visualizer.canvas.send(event)

    const { name, text } = await visualizer.saveAs(/Animated SVG/)

    expect(name).toBe("checkout.animated.svg")
    expect(text).toContain("Step 3 of 3: CHECKOUT")
    await matchesGolden("checkout.animated.svg", text)
  })
})
