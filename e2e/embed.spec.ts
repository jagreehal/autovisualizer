import { readFile } from "node:fs/promises"

import { expect, test } from "./fixtures"

import type { Page } from "@playwright/test"

/**
 * A docs page on another origin: the same server under 127.0.0.1 instead of localhost. It must be
 * a real loopback page, or Chrome's local network checks block the embed. `body` is its HTML.
 */
async function docsPage(page: Page, baseURL: string | undefined, body: string, head = "") {
  const docs = new URL(baseURL ?? "")
  docs.hostname = "127.0.0.1"
  const toggle = await readFile("e2e/fixtures/toggle.machine.json", "utf8")
  await page.route(`${docs.origin}/toggle.machine.json`, (route) =>
    route.fulfill({ contentType: "application/json", body: toggle })
  )
  // Any page on that origin will do; build the docs page into it.
  await page.goto(`${docs.origin}/embed/custom-elements.json`)
  await page.evaluate(
    ([html, extraHead, embed]) => {
      document.head.insertAdjacentHTML("beforeend", extraHead)
      document.body.innerHTML = html
      const script = document.createElement("script")
      script.type = "module"
      script.src = embed
      document.head.append(script)
    },
    [body, head, `${baseURL}/embed/embed.js`] as const
  )
}

const TOGGLE = `import { createMachine } from "xstate"
export const toggle = createMachine({
  id: "toggle",
  initial: "off",
  states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { TOGGLE: { target: "off" } } } }
})`

test.describe("The <auto-visualizer> embed", () => {
  test("renders and simulates on another origin's page", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<style>button { background: hotpink !important }</style>
       <meta name="auto-visualizer-fences" content="on">
       <pre><code class="language-statechart">${TOGGLE}</code></pre>
       <auto-visualizer id="json" src="/toggle.machine.json" style="height: 500px"></auto-visualizer>`
    )

    const chart = page.locator("#json")
    const off = chart.getByRole("group", { name: "off", exact: true })
    const on = chart.getByRole("group", { name: "on", exact: true })
    await expect(off).toHaveAttribute("aria-current", "true")
    await expect(chart).toHaveCSS("height", "500px")
    // An opt-in in the body (where visitors' Markdown lands) is ignored: the fence stays code.
    await expect(page.locator("pre")).toHaveCount(1)
    await expect(page.locator("auto-visualizer")).toHaveCount(1)

    await chart.getByRole("button", { name: "TOGGLE" }).and(chart.locator(":enabled")).click()
    await expect(on).toHaveAttribute("aria-current", "true")
    await expect(off).not.toHaveAttribute("aria-current")

    // The page's CSS stays outside the shadow root.
    await expect(chart.getByRole("button", { name: "Reset simulation" })).not.toHaveCSS(
      "background-color",
      "rgb(255, 105, 180)"
    )
  })

  test("reads docs markup: a Markdown fence, source in the tag, a walkthrough, loud failures", async ({
    page,
    baseURL
  }) => {
    await docsPage(
      page,
      baseURL,
      `<pre><code class="language-statechart">${TOGGLE}</code></pre>
       <auto-visualizer id="walk" style="height: 300px"
         walkthrough='[{"event":"TOGGLE","note":"switch it on"}]'>
         <script type="text/typescript">${TOGGLE}</script>
       </auto-visualizer>
       <auto-visualizer id="wrong" events="NOPE" style="height: 120px">
         <script type="text/typescript">${TOGGLE}</script>
       </auto-visualizer>`,
      `<meta name="auto-visualizer-fences" content="on">`
    )

    // The fence became a chart.
    await expect(page.locator("pre")).toHaveCount(0)
    await expect(page.locator("auto-visualizer")).toHaveCount(3)

    const walk = page.locator("#walk")
    const bar = walk.getByRole("group", { name: "Walkthrough" })
    await expect(walk.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    await bar.getByRole("button", { name: "Next step" }).click()
    await expect(walk.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
    await expect(bar).toContainText("switch it on")
    // The step is in the URL, so a link opens the walkthrough here.
    expect(new URL(page.url()).hash).toBe("#walk/1")

    // An event the machine doesn't accept shows an error.
    await expect(page.locator("#wrong").getByRole("alert")).toHaveText('"NOPE" isn\'t accepted in state "off"')
  })

  test("opens in a named state with input and context, and walks through events that carry data", async ({
    page,
    baseURL
  }) => {
    const COUNTER = `import { createMachine } from "xstate"
export const counter = createMachine({
  id: "counter",
  initial: "idle",
  context: ({ input }) => ({ count: input.start, step: 1 }),
  states: {
    idle: { on: { START: { target: "running" } } },
    running: {
      on: {
        ADD: ({ context, event }) => ({ context: { ...context, count: context.count + event.by } }),
        CHECK: ({ context }) => (context.count === 13 && context.step === 5 ? { target: "right" } : { target: "wrong" })
      }
    },
    right: {},
    wrong: {}
  }
})`
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="opened" state="running" input='{"start":10}' context='{"step":5}' style="height: 300px"
         walkthrough='[{"event":{"type":"ADD","by":3},"note":"add three"},{"event":"CHECK"}]'>
         <script type="text/typescript">${COUNTER}</script>
       </auto-visualizer>
       <auto-visualizer id="sent" events='["START",{"type":"ADD","by":3},"CHECK"]' input='{"start":10}'
         context='{"step":5}' style="height: 300px">
         <script type="text/typescript">${COUNTER}</script>
       </auto-visualizer>
       <auto-visualizer id="garbled" events='[{"by":3}]' input='{"start":10}' style="height: 120px">
         <script type="text/typescript">${COUNTER}</script>
       </auto-visualizer>
       <auto-visualizer id="lost" state="nowhere" style="height: 120px">
         <script type="text/typescript">${COUNTER}</script>
       </auto-visualizer>`
    )

    const chart = page.locator("#opened")
    await expect(chart.getByRole("group", { name: "running", exact: true })).toHaveAttribute("aria-current", "true")
    const bar = chart.getByRole("group", { name: "Walkthrough" })
    await bar.getByRole("button", { name: "Next step" }).click()
    await expect(bar).toContainText("ADD: add three")
    // count: input 10 + 3 from the event; step: 5 from the context attribute.
    await bar.getByRole("button", { name: "Next step" }).click()
    await expect(chart.getByRole("group", { name: "right", exact: true })).toHaveAttribute("aria-current", "true")

    // events as JSON: names and whole events, sent before the chart shows.
    await expect(page.locator("#sent").getByRole("group", { name: "right", exact: true })).toHaveAttribute(
      "aria-current",
      "true"
    )
    await expect(page.locator("#garbled").getByRole("alert")).toContainText(
      "The events attribute isn't a list of events"
    )

    await expect(page.locator("#lost").getByRole("alert")).toContainText(
      'No state "nowhere" in counter. Its states: idle, running, right, wrong'
    )
  })

  test("shows how often each event was taken, and the path a walkthrough took", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="counted" direction="down" style="height: 400px"
         counts='{"off":{"TOGGLE":35},"toggle.on":{"TOGGLE":0}}'
         walkthrough='[{"event":"TOGGLE","note":"switch it on"}]'>
         <script type="text/typescript">${TOGGLE}</script>
       </auto-visualizer>`
    )

    const chart = page.locator("#counted")
    // Counts match by state key (off) or full id (toggle.on), and read out with the event.
    const turnOn = chart.getByRole("button", { name: /^TOGGLE, taken 35 times/ })
    const turnOff = chart.getByRole("button", { name: /^TOGGLE, taken 0 times/ })
    await expect(turnOn).toContainText("35")
    await expect(turnOff).toContainText("0")
    await expect(turnOn).not.toHaveAccessibleName(/on the replayed path/)

    await chart.getByRole("group", { name: "Walkthrough" }).getByRole("button", { name: "Next step" }).click()
    await expect(turnOn).toHaveAccessibleName(/on the replayed path/)
    await expect(turnOff).not.toHaveAccessibleName(/on the replayed path/)
  })

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true })

    test("a pinch zooms the chart, a swipe scrolls the page, a tap sends an event", async ({ page, baseURL }) => {
      await docsPage(
        page,
        baseURL,
        `<auto-visualizer id="phone" style="height: 500px">
           <script type="text/typescript">${TOGGLE}</script>
         </auto-visualizer>
         <div style="height: 2000px"></div>`,
        // As on any real docs site: without it, mobile Chromium lays the page out 980px wide and shrinks it.
        `<meta name="viewport" content="width=device-width, initial-scale=1">`
      )
      const chart = page.locator("#phone")
      await expect(chart.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
      const box = await chart.boundingBox()
      if (box === null) throw new Error("the chart has no box")
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const viewport = chart.locator(".react-flow__viewport")
      const cdp = await page.context().newCDPSession(page)

      const before = await viewport.getAttribute("style")
      await cdp.send("Input.synthesizePinchGesture", { ...centre, scaleFactor: 1.5, gestureSourceType: "touch" })
      await expect.poll(() => viewport.getAttribute("style")).not.toBe(before)

      // Control first: a swipe on the plain page below the chart. Where the browser can't emulate a
      // touch scroll at all, there is nothing to compare the chart against.
      const swipe = (y: number) =>
        cdp.send("Input.synthesizeScrollGesture", { x: centre.x, y, yDistance: -300, gestureSourceType: "touch" })
      await swipe(box.y + box.height + 150)
      const scrolls = await expect
        .poll(() => page.evaluate(() => scrollY), { timeout: 3000 })
        .toBeGreaterThan(100)
        .then(() => true)
        .catch(() => false)
      if (scrolls) {
        await page.evaluate(() => scrollTo(0, 0))
        await swipe(centre.y)
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100)
      } else {
        test.info().annotations.push({ type: "skipped", description: "this browser can't emulate a touch scroll" })
        console.warn("Touch scroll can't be emulated here: the swipe check was skipped.")
      }

      await chart.getByRole("button", { name: "TOGGLE" }).and(chart.locator(":enabled")).tap()
      await expect(chart.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
    })
  })
})
