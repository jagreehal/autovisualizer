import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { evaluate } from "./evaluate"
import { machineToJSON } from "xstate"

import { codeFromDefinition } from "./definition"
import { toMachineGraph, unreachableStates } from "./graph"
import { start, step, view } from "./simulate"

const example = (name: string) => readFileSync(join(__dirname, "..", "examples", `${name}.ts`), "utf8")
const load = (code: string) =>
  Effect.runPromise(evaluate(code)).then((result) => result.machines.map((found) => found.machine))
const edges = (code: string) =>
  load(code).then(([machine]) =>
    toMachineGraph(machine!, undefined).edges.map(
      (e) => `${e.source} -${e.label}${e.inferred ? "?" : ""}-> ${e.target}`
    )
  )

describe("evaluate + graph", () => {
  it("approval: @xstate/effect setupEffect, after, function onDone", async () => {
    expect(await edges(example("approval"))).toEqual([
      "awaitingApproval -APPROVE-> deploying",
      "awaitingApproval -CANCEL-> cancelled",
      "awaitingApproval -after 30000ms-> expired",
      "deploying -CANCEL-> cancelled",
      "deploying -done: deploy?-> deployed",
      "deploying -error: deploy-> failed",
      "failed -RETRY-> deploying",
      "failed -CANCEL-> cancelled"
    ])
  })

  it("parallel: finds an unexported machine and keeps the parallel root", async () => {
    const [machine] = await load(example("parallel"))
    const graph = toMachineGraph(machine!, undefined)
    expect(graph.root).toMatchObject({ kind: "parallel" })
    expect(graph.root.children.map((c) => [c.key, c.initial])).toEqual([
      ["review", "release.review.pending"],
      ["build", "release.build.running"]
    ])
  })

  it("v6 guard branches: every literal target is an inferred edge; computed ones are unresolved", async () => {
    const graph = toMachineGraph(
      (
        await load(`
      import { createMachine } from 'xstate'
      const pick = (x: string) => x
      createMachine({
        id: 'pay', initial: 'editing',
        states: {
          editing: { on: {
            submit: ({ event }) => event.card ? { target: 'charging' } : { target: "paid" },
            other: ({ event }) => ({ target: pick(event.to) })
          } },
          charging: {}, paid: {}
        }
      })`)
      )[0]!,
      undefined
    )
    expect(graph.edges.map((e) => e.branch)).toEqual([1, 2])
    expect(graph.edges.map((e) => `${e.label}?-> ${e.target}`)).toEqual([
      "submit?-> pay.charging",
      "submit?-> pay.paid"
    ])
    expect(graph.unresolved).toEqual([{ source: "pay.editing", label: "other" }])
  })

  it("keeps machines when top-level code throws or never settles", async () => {
    const code = (tail: string) =>
      `import { createMachine } from 'xstate'\ncreateMachine({ initial: 'a', states: { a: {} } })\n${tail}`
    expect((await Effect.runPromise(evaluate(code("throw new Error('boom')")))).warning).toBe(
      "Top-level code threw: boom"
    )
    expect((await Effect.runPromise(evaluate(code("await new Promise(() => {})")))).warning).toContain("still running")
  })

  it("names an id-less machine after its export", async () => {
    const [found] = (await Effect.runPromise(evaluate(example("approval")))).machines
    expect(toMachineGraph(found!.machine, found!.name).id).toBe("approvalMachine")
  })

  it("checkout example: numbered guard branches, one unreachable state", async () => {
    const graph = toMachineGraph((await load(example("checkout")))[0]!, undefined)
    expect(
      graph.edges.filter((e) => e.branch !== undefined).map((e) => `${e.label}#${e.branch}-> ${e.target}`)
    ).toEqual(["FAIL#1-> checkout.declined", "FAIL#2-> checkout.payment"])
    expect([...unreachableStates(graph)]).toEqual(["checkout.refund"])
  })

  it("reports a compile error", async () => {
    const exit = await Effect.runPromiseExit(evaluate("const = ;"))
    expect(JSON.stringify(exit)).toContain("CompileError")
  })
})

describe("simulate", () => {
  it("steps approval through a function transition without running actors", async () => {
    const [machine] = await load(example("approval"))
    let snapshot = start(machine!, { release: "v1" })
    expect(view(snapshot, true).nextEvents.map((e) => e.label)).toEqual(["APPROVE", "CANCEL", "after 30000ms"])

    ;[snapshot] = step(machine!, snapshot, { type: "APPROVE" })
    const deploying = view(snapshot, true)
    expect(deploying.valueJson).toBe('"deploying"')
    const done = JSON.parse(deploying.nextEvents.find((e) => e.label === "done: deploy")!.eventJson)

    let handled: boolean
    ;[snapshot, handled] = step(machine!, snapshot, { ...done, output: "https://x" })
    expect(handled).toBe(true)
    expect(view(snapshot, handled)).toMatchObject({ valueJson: '"deployed"', status: "done" })
    expect(JSON.parse(view(snapshot, handled).contextJson)).toEqual({ release: "v1", url: "https://x" })
  })
})

describe("MachineJSON round trip", () => {
  const roundTrip = async (name: string) => {
    const [original] = await load(example(name))
    const json = JSON.stringify(machineToJSON(original!))
    const code = await Effect.runPromise(codeFromDefinition(json, `${name}.machine.json`))
    const [revived] = await load(code)
    return { original: original!, revived: revived! }
  }
  const edgeList = (machine: Parameters<typeof toMachineGraph>[0]) =>
    toMachineGraph(machine, "m").edges.map(
      (e) => `${e.source} -${e.label}${e.branch ?? ""}${e.inferred ? "?" : ""}-> ${e.target}`
    )

  it.each(["checkout", "approval", "parallel"])("%s: the revived machine draws the same graph", async (name) => {
    const { original, revived } = await roundTrip(name)
    expect(edgeList(revived)).toEqual(edgeList(original))
    expect(toMachineGraph(revived, "m").root).toEqual(toMachineGraph(original, "m").root)
  })

  it("checkout: the revived guard still runs (from @code text)", async () => {
    const { revived } = await roundTrip("checkout")
    let snapshot = start(revived, {})
    for (const type of ["ADD_ITEM", "CHECKOUT", "SUBMIT", "FAIL"]) [snapshot] = step(revived, snapshot, { type })
    expect(view(snapshot, true)).toMatchObject({ valueJson: '"payment"' })
    expect(JSON.parse(view(snapshot, true).contextJson)).toEqual({ items: 1, attempts: 1 })
  })

  it("approval: context from input and the invoke's done event work without the Effect service", async () => {
    const { revived } = await roundTrip("approval")
    let snapshot = start(revived, { release: "v1" })
    ;[snapshot] = step(revived, snapshot, { type: "APPROVE" })
    const done = JSON.parse(view(snapshot, true).nextEvents.find((e) => e.label === "done: deploy")!.eventJson)
    ;[snapshot] = step(revived, snapshot, { ...done, output: "https://x" })
    expect(JSON.parse(view(snapshot, true).contextJson)).toEqual({ release: "v1", url: "https://x" })
  })

  it("a file that is not a JSON object is a DefinitionError", async () => {
    const exit = await Effect.runPromiseExit(codeFromDefinition("[1, 2]", "bad.json"))
    expect(JSON.stringify(exit)).toContain("DefinitionError")
  })
})
