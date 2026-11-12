/**
 * Statecharts for READMEs: GitHub can't run the element, so draw each chart to an SVG file the
 * Markdown links to. A chart is an image followed by a collapsed `<details>` holding its source:
 *
 *   ![Checkout](docs/checkout.svg)
 *   <details><summary>Statechart source</summary>
 *
 *   ```statechart walkthrough='[{"event":"CHECKOUT"}]'
 *   export const checkout = createMachine({ … })
 *   ```
 *   </details>
 *
 * Attributes on the fence line are the element's own (`walkthrough`, `events`, `state`, `direction`…).
 * Source starting with `{` is MachineJSON; anything else is machine code.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export interface MarkdownChart {
  /** The SVG's path, relative to the Markdown file. */
  readonly image: string
  readonly attributes: ReadonlyMap<string, string>
  readonly source: string
}

const CHART =
  /!\[[^\]]*\]\(\s*([^)\s]+\.svg)[^)]*\)\s*<details>(?:(?!<\/details>)[\s\S])*?```statechart([^\n]*)\n([\s\S]*?)\n\s*```/g
const ATTRIBUTE = /([\w-]+)=(?:'([^']*)'|"([^"]*)")/g

export function findCharts(markdown: string): Array<MarkdownChart> {
  return [...markdown.matchAll(CHART)].flatMap(([, image = "", info = "", source = ""]) =>
    /^[a-z]+:/i.test(image)
      ? []
      : [
          {
            image,
            attributes: new Map(
              [...info.matchAll(ATTRIBUTE)].map(([, name = "", single, double]) => [name, single ?? double ?? ""])
            ),
            source: source.trim()
          }
        ]
  )
}

const TYPES = new Map([
  [".js", "text/javascript"],
  [".css", "text/css"],
  [".json", "application/json"],
  [".woff2", "font/woff2"]
])

/** The embed and an empty page, on one origin: machine code runs in a Web Worker, which needs HTTP. */
async function serveEmbed(embedDir: string) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname
    if (path === "/") {
      response.writeHead(200, { "content-type": "text/html" })
      response.end(
        '<!doctype html><meta charset="utf-8"><script type="module" src="/embed/embed.js"></script><body></body>'
      )
      return
    }
    const file = normalize(join(embedDir, path.replace(/^\/embed\//, "")))
    if (!path.startsWith("/embed/") || !file.startsWith(embedDir)) {
      response.writeHead(404).end()
      return
    }
    try {
      const body = readFileSync(file)
      response.writeHead(200, { "content-type": TYPES.get(extname(file)) ?? "application/octet-stream" }).end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  // SAFETY: a server listening on a TCP port reports an AddressInfo; only pipes report a string.
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}/`, close: () => server.close() }
}

/** Chrome from the runner (GitHub's Ubuntu images ship it), else Playwright's own Chromium. */
async function launchBrowser() {
  // Loaded at run time from the action's install: the bundler leaves it out of the CLI.
  const playwright = "@playwright/test"
  const { chromium }: typeof import("@playwright/test") = await import(/* @vite-ignore */ playwright)
  return chromium.launch({ channel: "chrome" }).catch(() => chromium.launch())
}

export interface RenderResult {
  readonly written: ReadonlyArray<string>
  readonly failed: ReadonlyArray<string>
}

/** Draws every chart in `files` and writes the SVGs that changed. */
export async function renderMarkdown(files: ReadonlyArray<string>, embedDir: string): Promise<RenderResult> {
  const charts = files.flatMap((file) =>
    findCharts(readFileSync(file, "utf8")).map((chart) => ({ file, chart, out: resolve(dirname(file), chart.image) }))
  )
  const written: Array<string> = []
  const failed: Array<string> = []
  if (charts.length === 0) return { written, failed }
  if (!existsSync(join(embedDir, "embed.js")))
    throw new Error(`No embed.js in ${embedDir}. Build it first: pnpm build:embed`)

  const server = await serveEmbed(resolve(embedDir))
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await page.goto(server.url)
    for (const { file, chart, out } of charts) {
      await page.evaluate(
        ([attributes, source]) => {
          const element = document.createElement("auto-visualizer")
          element.setAttribute("style", "height: 600px")
          for (const [name, value] of attributes) element.setAttribute(name, value)
          element.setAttribute(source.startsWith("{") ? "definition" : "code", source)
          document.body.replaceChildren(element)
        },
        [[...chart.attributes], chart.source] as const
      )
      const element = page.locator("auto-visualizer")
      const alert = element.getByRole("alert")
      // Ready when the export method arrives with the chart's graph, or the chart shows why it can't draw.
      const ready = element
        .evaluate(
          (node) =>
            new Promise((done) => {
              const check = () => ("toAnimatedSvg" in node ? done(undefined) : requestAnimationFrame(check))
              check()
            })
        )
        .then(() => "chart")
      const shown = await Promise.race([ready, alert.waitFor({ timeout: 30_000 }).then(() => "alert")]).catch(
        () => "timeout"
      )
      if (shown !== "chart") {
        failed.push(
          `${file} → ${chart.image}: ${shown === "alert" ? await alert.innerText() : "the chart didn't load in 30s"}`
        )
        continue
      }
      const svg = await element.evaluate(
        (node: HTMLElement & { toAnimatedSvg: (options: { direction: "right" | "down" }) => Promise<string> }, down) =>
          node.toAnimatedSvg({ direction: down ? "down" : "right" }),
        chart.attributes.get("direction") === "down"
      )
      const before = (() => {
        try {
          return readFileSync(out, "utf8")
        } catch {
          return undefined
        }
      })()
      if (before === svg) continue
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, svg)
      written.push(out)
    }
  } finally {
    await browser.close()
    server.close()
  }
  return { written, failed }
}

/** `public/embed` beside the built CLI (`dist/review/cli.mjs`). */
export const defaultEmbedDir = () => fileURLToPath(new URL("../../public/embed/", import.meta.url))
