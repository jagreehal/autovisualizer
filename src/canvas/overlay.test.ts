import { describe, expect, it } from "vitest"

import { countsByEdge, takenEdges } from "./overlay"

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

// validate --ok--> fetchRate, validate --err--> ValidationError, fetchRate --ok--> done
const graph: MachineGraph = {
  id: "transfer",
  root: state("transfer", [
    state("transfer.validate"),
    state("transfer.fetchRate"),
    state("transfer.ValidationError"),
    state("transfer.done")
  ]),
  edges: [
    edge("transfer.validate", "ok", "transfer.fetchRate"),
    edge("transfer.validate", "err", "transfer.ValidationError"),
    edge("transfer.fetchRate", "ok", "transfer.done")
  ],
  unresolved: [],
  definitionJson: "{}"
}

describe("countsByEdge", () => {
  it("matches counts to edges by state key and event type", () => {
    const counts = countsByEdge(graph, { validate: { ok: 35, err: 17 }, fetchRate: { ok: 0 } })
    expect(Object.fromEntries(counts)).toEqual({
      "transfer.validate:ok": 35,
      "transfer.validate:err": 17,
      "transfer.fetchRate:ok": 0
    })
  })

  it("prefers a full state id over a key, and leaves out edges with no count", () => {
    const counts = countsByEdge(graph, { validate: { ok: 1 }, "transfer.validate": { ok: 2 } })
    expect(Object.fromEntries(counts)).toEqual({ "transfer.validate:ok": 2 })
  })
})

describe("takenEdges", () => {
  it("returns every edge of a taken transition, and only the branch it went to", () => {
    const branchy: MachineGraph = {
      ...graph,
      edges: [
        { ...edge("transfer.validate", "go", "transfer.fetchRate"), id: "transfer.validate:0:0", branch: 1 },
        { ...edge("transfer.validate", "go", "transfer.done"), id: "transfer.validate:0:1", branch: 2 },
        { ...edge("transfer.fetchRate", "ok", "transfer.done"), id: "transfer.fetchRate:0:0" }
      ]
    }
    expect(
      takenEdges(branchy, [
        { transition: "transfer.validate:0", targets: ["transfer.done"] },
        { transition: "transfer.fetchRate:0", targets: ["transfer.done"] }
      ])
    ).toEqual(["transfer.validate:0:1", "transfer.fetchRate:0:0"])
  })
})
