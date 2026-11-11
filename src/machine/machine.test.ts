import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { evaluate } from "./evaluate"
import { machineToJSON } from "xstate"

import { codeFromDefinition } from "./definition"
import { toMachineGraph, unreachableStates } from "./graph"
import { restore, start, step, view } from "./simulate"
import { takenEdges } from "../canvas/overlay"

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

describe("restore", () => {
  const COUNTER = `import { createMachine } from "xstate"
export const counter = createMachine({
  id: "counter",
  initial: "idle",
  context: { visits: 0 },
  states: {
    idle: { on: { GO: { target: "busy" } } },
    busy: {
      entry: ({ context }) => ({ context: { visits: context.visits + 1 } }),
      initial: "a",
      states: { a: { on: { NEXT: { target: "b" } } }, b: {}, hist: { type: "history", target: "a" } },
      on: { PAUSE: { target: "idle" } }
    }
  }
})`

  it("resumes a persisted snapshot as it was, without entering its states again", async () => {
    const [machine] = await load(COUNTER)
    let snapshot = start(machine!, {})
    for (const type of ["GO", "NEXT"]) [snapshot] = step(machine!, snapshot, { type })
    const persisted = JSON.parse(JSON.stringify(machine!.getPersistedSnapshot!(snapshot)))

    const resumed = restore(machine!, persisted)
    // busy's entry ran once, on GO; resuming doesn't run it again, as state="busy.b" would.
    expect(view(resumed, true)).toMatchObject({ valueJson: '{\n  "busy": "b"\n}', contextJson: '{\n  "visits": 1\n}' })
    expect(JSON.parse(view(start(machine!, {}, "busy.b", { visits: 1 }), true).contextJson)).toEqual({ visits: 2 })
  })

  it("says what doesn't fit", async () => {
    const [machine] = await load(COUNTER)
    expect(() => restore(machine!, { status: "active", value: "nowhere", context: {}, children: {} })).toThrow()
    expect(() => restore(machine!, { status: "sleeping" })).toThrow(/active, done, error or stopped/)
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

describe("taken transitions", () => {
  const taken = async (code: string, type: string) => {
    const [machine] = await load(`import { createMachine } from 'xstate'\n${code}`)
    const [, , trace] = step(machine!, start(machine!, {}), { type })
    const graph = toMachineGraph(machine!, undefined)
    const ids = takenEdges(graph, trace)
    return graph.edges.filter((e) => ids.includes(e.id)).map((e) => `${e.source} -> ${e.target}`)
  }

  it("includes eventless transitions taken after the event", async () => {
    expect(
      await taken(
        `createMachine({ id: 'm', initial: 'a', states: { a: { on: { GO: { target: 'b' } } }, b: { always: { target: 'c' } }, c: {} } })`,
        "GO"
      )
    ).toEqual(["m.a -> m.b", "m.b -> m.c"])
  })

  it("leaves out a parent's transition when a child handles the event", async () => {
    expect(
      await taken(
        `createMachine({ id: 'm', initial: 'p', states: { p: { on: { GO: {} }, initial: 'x', states: { x: { on: { GO: { target: 'y' } } }, y: {} } } } })`,
        "GO"
      )
    ).toEqual(["m.p.x -> m.p.y"])
  })

  it("finds a transition function's edge", async () => {
    expect(
      await taken(
        `createMachine({ id: 'm', initial: 'a', states: { a: { on: { GO: () => ({ target: 'b' }) } }, b: {} } })`,
        "GO"
      )
    ).toEqual(["m.a -> m.b"])
  })

  it("keeps a function's branch into a state an eventless transition then leaves", async () => {
    expect(
      await taken(
        `createMachine({ id: 'm', initial: 'a', context: { ok: true }, states: {
          a: { on: { GO: ({ context }) => context.ok ? { target: 'b' } : { target: 'd' } } },
          b: { always: { target: 'c' } }, c: {}, d: {} } })`,
        "GO"
      )
    ).toEqual(["m.a -> m.b", "m.b -> m.c"])
  })

  it("runs a transition function once per event, and the trace matches the snapshot", async () => {
    const [machine] = await load(`import { createMachine } from 'xstate'
      let calls = 0
      createMachine({ id: 'm', initial: 'a', states: {
        a: { on: { GO: () => (++calls === 1 ? { target: 'b' } : { target: 'c' }) } }, b: {}, c: {} } })`)
    const [next, , trace] = step(machine!, start(machine!, {}), { type: "GO" })
    expect(next.value).toBe("b")
    expect(trace).toEqual([{ transition: "m.a:0", targets: ["m.b"] }])
  })
})

describe("start", () => {
  const machine = () =>
    load(`import { createMachine } from 'xstate'
      createMachine({ id: 'm', initial: 'a', context: ({ input }) => ({ n: input?.n ?? 0, k: 1 }), states: {
        a: { on: { GO: { target: 'p' } } },
        p: { type: 'parallel', states: {
          x: { initial: 'x1', states: { x1: { on: { GO: { target: 'x2' } } }, x2: {} } },
          y: { initial: 'y1', states: { y1: {}, y2: {} } } } } } })`).then(([m]) => m!)

  it("opens at the initial state with the input", async () => {
    const snapshot = start(await machine(), { n: 5 })
    expect([snapshot.value, snapshot.context]).toEqual(["a", { n: 5, k: 1 }])
  })

  it("opens in a state named by path or full id, one per parallel region, with context laid over", async () => {
    const m = await machine()
    expect(start(m, {}, "p.x.x2 m.p.y.y2", { k: 9 })).toMatchObject({
      value: { p: { x: "x2", y: "y2" } },
      context: { n: 0, k: 9 }
    })
    // A compound state opens at its initial children, and events go on from there.
    const [next] = step(m, start(m, {}, "p"), { type: "GO" })
    expect(next.value).toEqual({ p: { x: "x2", y: "y1" } })
  })

  it("doesn't run the initial route when a state is named", async () => {
    const [m] = await load(`import { createMachine } from 'xstate'
      createMachine({ id: 'm', initial: 'a', context: ({ input }) => ({ n: input.n }), states: {
        a: { entry: ({ context }) => ({ context: { ...context, n: 7 } }), always: () => ({ target: 'b', context: { n: 99 } }) },
        b: {}, c: {} } })`)
    expect(start(m!, { n: 0 }, "c")).toMatchObject({ value: "c", context: { n: 0 } })
    expect(start(m!, { n: 0 }, "c", { k: 1 }).context).toEqual({ n: 0, k: 1 })
    // Without a state the machine starts as usual, route and all.
    expect(start(m!, { n: 0 }).context).toEqual({ n: 99 })
  })

  it("enters a named state as if it were initial: entry actions, eventless transitions and done events run", async () => {
    const [m] = await load(`import { createMachine } from 'xstate'
      createMachine({ id: 'm', initial: 'a', context: { n: 0 }, states: {
        a: {},
        p: { initial: 'a', onDone: { target: 'd' }, states: {
          a: {}, b: { entry: ({ context }) => ({ context: { n: context.n + 5 } }), always: { target: 'c' } }, c: { type: 'final' } } },
        d: {} } })`)
    expect(start(m!, {}, "p.b")).toMatchObject({ value: "d", context: { n: 5 } })
    // Context is laid over before the machine starts, so entry actions see it.
    expect(start(m!, {}, "p.b", { n: 10 }).context).toEqual({ n: 15 })
  })

  it("sends no event to open in a state, so wildcard handlers don't run", async () => {
    const [m] = await load(`import { createMachine } from 'xstate'
      createMachine({ id: 'm', initial: 'a', on: { '*': ({ event }) => ({ context: { n: event.payload.n } }) },
        states: { a: {}, b: {} } })`)
    expect(start(m!, {}, "b").value).toBe("b")
  })

  it("lays context over the initial state when no state is named", async () => {
    expect(start(await machine(), { n: 2 }, "", { k: 3 })).toMatchObject({ value: "a", context: { n: 2, k: 3 } })
  })

  it("names the machine's states when the state is unknown", async () => {
    const m = await machine()
    expect(() => start(m, {}, "nope")).toThrow(
      'No state "nope" in m. Its states: a, p, p.x, p.x.x1, p.x.x2, p.y, p.y.y1, p.y.y2'
    )
  })
})

describe("start keeps history", () => {
  it("restores a history state recorded while opening in a named state", async () => {
    const [m] = await load(`import { createMachine } from 'xstate'
      createMachine({ id: 'm', initial: 'p', context: { leave: true }, states: {
        p: { initial: 'a', states: {
          a: {}, b: { always: ({ context }) => (context.leave ? { target: '#m.q' } : undefined) }, h: { type: 'history', target: 'a' } } },
        q: { entry: () => ({ context: { leave: false } }), on: { BACK: { target: 'p.h' } } } } })`)
    for (const opened of [start(m!, {}, "p.b"), start(m!, {}, "p.b", { n: 1 })]) {
      expect(opened.value).toBe("q")
      expect(step(m!, opened, { type: "BACK" })[0].value).toEqual({ p: "b" })
    }
  })
})
