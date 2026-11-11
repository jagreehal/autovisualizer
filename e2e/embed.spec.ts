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

  test("fits its height to the chart when the page sets none", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<div style="width: 320px"><auto-visualizer id="fit"><script type="text/typescript">${TOGGLE}</script></auto-visualizer></div>`
    )
    const chart = page.locator("#fit")
    await expect(chart.getByRole("group", { name: "off", exact: true })).toBeVisible()
    // Not the 480px placeholder, and within the readable range.
    await expect.poll(async () => (await chart.boundingBox())?.height).toBeGreaterThanOrEqual(240)
    await expect.poll(async () => (await chart.boundingBox())?.height).not.toBe(480)
    expect((await chart.boundingBox())?.height).toBeLessThanOrEqual(720)
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

/** A railway: six steps in a chain, each with an `err` exit to its own final state. */
const RAILWAY = (() => {
  const steps = ["validate", "fetchRate", "getBalance", "convert", "execute", "confirm"]
  const states = Object.fromEntries([
    ["done", { type: "final" }],
    ...steps.flatMap((step, i) => [
      [step, { on: { ok: { target: steps[i + 1] ?? "done" }, err: { target: `${step}Failed` } } }],
      [`${step}Failed`, { type: "final", tags: ["error"] }]
    ])
  ])
  return { id: "railway", initial: "validate", states }
})()

const TOGGLE_JSON = JSON.stringify({
  id: "toggle",
  initial: "off",
  states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { TOGGLE: { target: "off" } } } }
})

test.describe("<auto-visualizer> with a MachineJSON definition", () => {
  test("draws and steps an inline definition, and charts that share one", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="inline" style="height: 300px"><script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>
       <script type="application/json" id="shared">${TOGGLE_JSON}</script>
       <auto-visualizer id="a" definition="#shared" style="height: 300px"></auto-visualizer>
       <auto-visualizer id="b" definition="#shared" events="TOGGLE" style="height: 300px"></auto-visualizer>`
    )
    const inline = page.locator("#inline")
    await expect(inline.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    await inline.getByRole("button", { name: "TOGGLE" }).and(inline.locator(":enabled")).click()
    await expect(inline.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
    // Two charts from one definition, each with its own simulation.
    await expect(page.locator("#a").getByRole("group", { name: "off", exact: true })).toHaveAttribute(
      "aria-current",
      "true"
    )
    await expect(page.locator("#b").getByRole("group", { name: "on", exact: true })).toHaveAttribute(
      "aria-current",
      "true"
    )
  })

  test("works on a page opened from disk, where a chart written as code says why it can't", async ({
    page,
    baseURL
  }, testInfo) => {
    const file = testInfo.outputPath("docs.html")
    const { writeFile } = await import("node:fs/promises")
    await writeFile(
      file,
      `<!doctype html><script type="module" src="${baseURL}/embed/embed.js"></script>
       <auto-visualizer id="json" style="height: 300px"><script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>
       <auto-visualizer id="code" style="height: 200px"><script type="text/typescript">${TOGGLE}</script></auto-visualizer>`
    )
    await page.goto(`file://${file}`)
    const json = page.locator("#json")
    await expect(json.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    await json.getByRole("button", { name: "TOGGLE" }).and(json.locator(":enabled")).click()
    await expect(json.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
    // Straight away, not after the 5 second timeout, and naming the cause.
    await expect(page.locator("#code").getByRole("alert")).toContainText("opened from disk", { timeout: 3000 })
  })
})

/** The element once its chart has loaded: the method a docs build calls from a headless browser. */
type Exporting = HTMLElement & {
  toAnimatedSvg(options: { title: string; direction?: "right" | "down" }): Promise<string>
}

test.describe("<auto-visualizer> layout, links and export", () => {
  test("lays a long chain out top to bottom in a wide column", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<div style="width: 1100px"><auto-visualizer id="chain" definition='${JSON.stringify(RAILWAY)}'></auto-visualizer></div>`
    )
    const chart = page.locator("#chain")
    const first = await chart.getByRole("group", { name: "validate", exact: true }).boundingBox()
    const last = await chart.getByRole("group", { name: "confirm", exact: true }).boundingBox()
    if (first === null || last === null) throw new Error("the states have no box")
    expect(last.y - first.y).toBeGreaterThan(Math.abs(last.x - first.x))
  })

  test("resumes a persisted snapshot, and says why one doesn't fit", async ({ page, baseURL }) => {
    const ON = JSON.stringify({ status: "active", value: "on", context: {}, children: {}, historyValue: {} })
    const NOWHERE = JSON.stringify({ status: "active", value: "nowhere", context: {}, children: {} })
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="resumed" style="height: 300px" snapshot='${ON}'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>
       <auto-visualizer id="misfit" style="height: 120px" snapshot='${NOWHERE}'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>`
    )
    const chart = page.locator("#resumed")
    await expect(chart.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
    await chart.getByRole("button", { name: "TOGGLE" }).and(chart.locator(":enabled")).first().click()
    await expect(chart.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    await expect(page.locator("#misfit").getByRole("alert")).toContainText("The snapshot can't be restored")
  })

  test("follows a deep link to a step on the page already showing it", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="walk" style="height: 300px" walkthrough='[{"event":"TOGGLE","note":"on"},{"event":"TOGGLE","note":"off again"}]'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>`
    )
    const bar = page.locator("#walk").getByRole("group", { name: "Walkthrough" })
    await expect(bar).toContainText("0/2")
    await page.evaluate(() => (location.hash = "#walk/2"))
    await expect(bar).toContainText("2/2")
    await expect(bar).toContainText("off again")
  })

  test("exports its walkthrough as an animated SVG", async ({ page, baseURL }) => {
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="walk" style="height: 300px" walkthrough='[{"event":"TOGGLE","note":"switch it on"}]'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>`
    )
    const chart = page.locator("#walk")
    await expect(chart.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    await chart.getByRole("group", { name: "Walkthrough" }).getByRole("button", { name: "Next step" }).click()
    const svg = await chart.evaluate((element: Exporting) =>
      element.toAnimatedSvg({ title: "Toggle", direction: "down" })
    )
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain("Step 1 of 2: start")
    expect(svg).toContain("Step 2 of 2: TOGGLE: switch it on")
    expect(svg).not.toContain("<script")
    // The machine's name bar sits above its states, not over the first one (top to bottom puts a state at the top).
    const header =
      /<rect x="[\d.-]+" y="([\d.-]+)" width="[\d.-]+" height="([\d.-]+)" rx="6" fill="var\(--header\)"/.exec(svg)
    const stateTops = [...svg.matchAll(/<rect x="[\d.-]+" y="([\d.-]+)"[^>]*fill="var\(--node\)"/g)].map((m) =>
      Number(m[1])
    )
    expect(header, "the name bar").not.toBeNull()
    expect(Math.min(...stateTops)).toBeGreaterThanOrEqual(Number(header?.[1]) + Number(header?.[2]))
    // The chart is back on the step it showed.
    await expect(chart.getByRole("group", { name: "on", exact: true })).toHaveAttribute("aria-current", "true")
  })

  test("export keeps a state reached by clicking, and rejects an event the machine doesn't accept", async ({
    page,
    baseURL
  }) => {
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="clicked" style="height: 300px" walkthrough='[{"event":"TOGGLE"}]'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>
       <auto-visualizer id="bad" style="height: 300px" walkthrough='[{"event":"NO_SUCH_EVENT"}]'>
         <script type="application/json">${TOGGLE_JSON}</script></auto-visualizer>`
    )
    const chart = page.locator("#clicked")
    const on = chart.getByRole("group", { name: "on", exact: true })
    // Reach "on" by clicking, with the walkthrough still at step 0.
    await chart.getByRole("button", { name: "TOGGLE" }).and(chart.locator(":enabled")).first().click()
    await expect(on).toHaveAttribute("aria-current", "true")
    await chart.evaluate((element: Exporting) => element.toAnimatedSvg({ title: "Toggle" }))
    await expect(on).toHaveAttribute("aria-current", "true")

    const bad = page.locator("#bad")
    await expect(bad.getByRole("group", { name: "off", exact: true })).toHaveAttribute("aria-current", "true")
    const failure = await bad.evaluate((element: Exporting) =>
      element.toAnimatedSvg({ title: "Bad" }).then(
        () => "exported",
        (cause: unknown) => String(cause)
      )
    )
    expect(failure).toContain(`"NO_SUCH_EVENT" isn't accepted in state "off"`)
  })

  test("a click queued during an export meets the state the chart shows", async ({ page, baseURL }) => {
    // One-way: a click meant for the shown "closed" would be rejected if it ran in the export's final "open". Code,
    // not a definition: the worker's round trips keep the export in the queue while the click arrives.
    const DOOR = `import { createMachine } from "xstate"
export const door = createMachine({ id: "door", initial: "closed", states: { closed: { on: { OPEN: { target: "open" } } }, open: {} } })`
    await docsPage(
      page,
      baseURL,
      `<auto-visualizer id="door" style="height: 300px" walkthrough='[{"event":"OPEN"}]'>
         <script type="text/typescript">${DOOR}</script></auto-visualizer>`
    )
    const chart = page.locator("#door")
    await expect(chart.getByRole("group", { name: "closed", exact: true })).toHaveAttribute("aria-current", "true")
    const open = await chart
      .getByRole("button", { name: "OPEN" })
      .and(chart.locator(":enabled"))
      .first()
      .elementHandle()
    // Click once the export holds the queue (it joins after one await), so the click queues behind it.
    await chart.evaluate(async (element: Exporting, button) => {
      const exported = element.toAnimatedSvg({ title: "Door" })
      await new Promise((resolve) => setTimeout(resolve, 0))
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await exported
    }, open)
    await expect(chart.getByRole("group", { name: "open", exact: true })).toHaveAttribute("aria-current", "true")
  })
})
