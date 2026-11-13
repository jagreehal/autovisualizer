import { describe, expect, it } from "vitest"

import { diffGraphs } from "./diff"

import type { MachineGraph, StateGraphEdge, StateGraphNode } from "@/machine/graph"

const state = (id: string, children: ReadonlyArray<StateGraphNode> = []): StateGraphNode => ({
  id,
  key: id.split(".").pop() ?? id,
  kind: children.length > 0 ? "compound" : "atomic",
  initial: children[0]?.id,
  invokes: [],
  tags: [],
  description: undefined,
  children
})

const edge = (source: string, type: string, target: string): StateGraphEdge => ({
  id: `${source}:${type}`,
  source,
  target,
  eventJson: JSON.stringify({ type }),
  label: type,
  kind: "event",
  inferred: false,
  branch: undefined
})

const machine = (id: string, states: ReadonlyArray<string>, edges: ReadonlyArray<StateGraphEdge>): MachineGraph => ({
  id,
  root: state(
    id,
    states.map((key) => state(`${id}.${key}`))
  ),
  edges,
  unresolved: [],
  definitionJson: "{}"
})

// The checkout PR: RETRY now loops back into payment, and REFUND is gone.
const before = machine(
  "checkout",
  ["payment", "declined", "refund"],
  [edge("checkout.payment", "FAIL", "checkout.declined"), edge("checkout.declined", "REFUND", "checkout.refund")]
)
const after = machine(
  "checkout",
  ["payment", "declined", "refund"],
  [edge("checkout.payment", "FAIL", "checkout.declined"), edge("checkout.declined", "RETRY", "checkout.payment")]
)

describe("diffGraphs", () => {
  it("marks an added transition and keeps a removed one, with nothing to send", () => {
    const { graph, changes } = diffGraphs(before, after)
    expect(changes.get("checkout.declined:RETRY")).toBe("added")
    expect(changes.get("checkout.payment:FAIL")).toBeUndefined()
    const lost = graph.edges.find((e) => e.label === "REFUND")
    expect(lost?.id).toBe("removed:checkout.declined:REFUND")
    expect(changes.get(lost?.id ?? "")).toBe("removed")
    expect(lost?.eventJson).toBeUndefined()
  })

  it("puts a removed state back under its old parent, and marks a new one", () => {
    const later = machine("checkout", ["payment", "declined", "confirmed"], after.edges)
    const { graph, changes } = diffGraphs(before, later)
    expect(graph.root.children.map((s) => s.key)).toEqual(["payment", "declined", "confirmed", "refund"])
    expect(changes.get("checkout.refund")).toBe("removed")
    expect(changes.get("checkout.confirmed")).toBe("added")
  })

  it("reads a renamed machine's states as the same states", () => {
    const renamed = machine(
      "shop",
      ["payment", "declined", "refund"],
      [edge("shop.payment", "FAIL", "shop.declined"), edge("shop.declined", "REFUND", "shop.refund")]
    )
    expect(diffGraphs(before, renamed).changes.size).toBe(0)
  })

  it("keeps a child moved out of a removed parent once, where it is now", () => {
    const parent = (id: string, children: ReadonlyArray<StateGraphNode>) => state(id, children)
    // `#pay` sat inside `old`; the change deletes `old` and moves `#pay` up beside `idle`.
    const was: MachineGraph = {
      ...machine("m", ["idle"], []),
      root: state("m", [state("m.idle"), parent("m.old", [state("pay"), state("m.old.gone")])])
    }
    const now: MachineGraph = { ...machine("m", ["idle"], []), root: state("m", [state("m.idle"), state("pay")]) }
    const { graph, changes } = diffGraphs(was, now)
    const ids = (node: StateGraphNode): Array<string> => [node.id, ...node.children.flatMap(ids)]
    expect(ids(graph.root).filter((id) => id === "pay")).toHaveLength(1)
    expect(changes.get("pay")).toBeUndefined()
    expect(changes.get("m.old")).toBe("removed")
    expect(changes.get("m.old.gone")).toBe("removed")
    expect(graph.root.children.find((s) => s.id === "m.old")?.children.map((s) => s.id)).toEqual(["m.old.gone"])
  })
})
