import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { buildReview, machineCode, renderReviewMarkdown, reviewSources } from "./review"

const machine = (states: string) => `
import { createMachine } from "xstate"
import { track } from "./analytics"
track("loaded")
export const door = createMachine({ id: "door", initial: "closed", states: { ${states} } })`

const before = machine(`closed: { on: { OPEN: { target: "open" } } }, open: { on: { CLOSE: { target: "closed" } } }`)
const after = machine(
  `closed: { on: { OPEN: { target: "open" }, LOCK: { target: "locked" } } }, open: {}, locked: {}, jammed: {}`
)

describe("review", () => {
  it("diffs states and transitions, with stand-ins for the file's own imports", async () => {
    const { machines, error } = await Effect.runPromise(reviewSources(before, after))
    expect(error).toBeUndefined()
    expect(machines).toMatchObject([
      {
        id: "door",
        kind: "changed",
        statesAdded: ["locked", "jammed"],
        transitionsAdded: ["closed --LOCK--> locked"],
        transitionsRemoved: ["open --CLOSE--> closed"],
        newlyUnreachable: ["jammed"]
      }
    ])
  })

  it("renders a high-risk comment with a highlighted statechart", async () => {
    const { machines } = await Effect.runPromise(reviewSources(before, after))
    const markdown = renderReviewMarkdown({
      base: "main",
      head: "HEAD",
      risk: "high",
      files: [{ path: "src/door.ts", status: "modified", machines }]
    })
    expect(markdown).toContain("**Merge risk:** 🔴 High")
    expect(markdown).toContain("```mermaid\nstateDiagram-v2")
    expect(markdown).toMatch(/class s\d+ added\n {2}class s\d+ warn/)
    expect(markdown).toContain("- open --CLOSE--> closed")
  })

  it("reports a file it can't evaluate instead of skipping it", async () => {
    const { error } = await Effect.runPromise(reviewSources(undefined, `createMachine({ id: "x" `))
    expect(error).toBeDefined()
  })
})

describe("MachineJSON files", () => {
  const json = (states: string) => `{ "id": "door", "initial": "closed", "states": { ${states} } }`

  it("reviews a machine.json like the code that built it", async () => {
    const code = (text: string) => Effect.runPromise(machineCode("machines/door.machine.json", text))
    const { machines } = await Effect.runPromise(
      reviewSources(
        await code(json(`"closed": { "on": { "OPEN": { "target": "open" } } }, "open": {}`)),
        await code(json(`"closed": { "on": { "OPEN": { "target": "open" } } }, "open": {}, "locked": {}`))
      )
    )
    expect(machines).toMatchObject([{ id: "door", kind: "changed", statesAdded: ["locked"] }])
  })

  it("skips JSON that isn't a machine", async () => {
    expect(await Effect.runPromise(machineCode("package.json", `{ "name": "x" }`))).toBeUndefined()
  })
})

describe("changed states", () => {
  it("reports a state that changed kind", async () => {
    const { machines } = await Effect.runPromise(
      reviewSources(machine(`closed: {}, open: {}`), machine(`closed: {}, open: { type: "final" }`))
    )
    expect(machines).toMatchObject([{ id: "door", kind: "changed", statesChanged: ["open: atomic → final"] }])
  })

  it("reports a machine that now starts somewhere else", async () => {
    const { machines } = await Effect.runPromise(
      reviewSources(
        machine(`closed: {}, open: {}`),
        machine(`closed: {}, open: {}`).replace(`initial: "closed"`, `initial: "open"`)
      )
    )
    expect(machines).toMatchObject([{ id: "door", kind: "changed", statesChanged: ["door: initial closed → open"] }])
  })
})

describe("untrusted names", () => {
  it("escapes a machine id inside the comment's HTML", async () => {
    const hostile = machine(`closed: {}`).replace(`id: "door"`, `id: "<img src=x onerror=alert(1)>"`)
    const { machines } = await Effect.runPromise(reviewSources(undefined, hostile))
    const markdown = renderReviewMarkdown({
      base: "main",
      head: "HEAD",
      risk: "low",
      files: [{ path: "src/<b>door</b>.ts", status: "added", machines }]
    })
    const summary = markdown.split("\n").find((line) => line.startsWith("<summary>🗺️"))
    expect(summary).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(summary).toContain("src/&lt;b&gt;door&lt;/b&gt;.ts")
    expect(summary).not.toMatch(/<img|<b>/)
  })
})

describe("buildReview", () => {
  it("reviews the branch against where it left the base, not the base's later commits", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "review-"))
    const run = (...args: ReadonlyArray<string>) => execFileSync("git", args, { cwd, stdio: "pipe" })
    const commit = (path: string, text: string) => {
      writeFileSync(join(cwd, path), text)
      run("add", path)
      run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", path)
    }
    run("init", "-q", "-b", "main")
    commit("door.ts", before)
    run("checkout", "-qb", "docs")
    commit("README.md", "# Door")
    run("checkout", "-q", "main")
    commit("door.ts", after)

    const report = await buildReview({ base: "main", head: "docs", cwd })
    expect(report.files).toEqual([])
    expect(report.risk).toBe("low")
  })
})
