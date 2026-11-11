import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { pageEngine } from "./in-page"
import { carriesCode } from "./json"

const TOGGLE = {
  id: "toggle",
  initial: "off",
  states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { TOGGLE: { target: "off" } } } }
}

describe("the page's engine, for MachineJSON definitions", () => {
  it("loads, starts and steps a definition with no worker", async () => {
    const engine = pageEngine()
    const run = <A>(program: Effect.Effect<A, { readonly message: string }>) => Effect.runPromise(program)
    const loaded = await run(engine({ _tag: "Load", id: 0, code: JSON.stringify(TOGGLE) }))
    expect(loaded._tag === "Loaded" && loaded.machines.map((graph) => graph.id)).toEqual(["toggle"])
    const started = await run(
      engine({ _tag: "Start", id: 1, machine: 0, inputJson: "{}", state: "", contextJson: "{}" })
    )
    expect(started._tag === "Simulated" && started.view.active).toEqual(["toggle", "toggle.off"])
    const sent = await run(engine({ _tag: "Send", id: 2, eventJson: JSON.stringify({ type: "TOGGLE" }) }))
    expect(sent._tag === "Simulated" && sent.view.active).toEqual(["toggle", "toggle.on"])
  })

  it("refuses a definition that carries code, which only the worker may run", async () => {
    const guarded = {
      ...TOGGLE,
      states: { ...TOGGLE.states, off: { on: { TOGGLE: { target: "on", guard: { "@expr": "true" } } } } }
    }
    expect(carriesCode(guarded)).toBe(true)
    expect(carriesCode(TOGGLE)).toBe(false)
    const result = await Effect.runPromise(
      Effect.result(pageEngine()({ _tag: "Load", id: 0, code: JSON.stringify(guarded) }))
    )
    expect(result._tag === "Failure" && result.failure.message).toMatch(/carries code/)
  })

  it("says what is wrong with text that isn't a JSON object", async () => {
    const result = await Effect.runPromise(Effect.result(pageEngine()({ _tag: "Load", id: 0, code: "#checkout" })))
    expect(result._tag === "Failure" && result.failure.message).toMatch(/isn't a JSON object/)
  })
})
