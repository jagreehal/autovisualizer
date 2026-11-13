/**
 * Two versions of a machine as one chart: the later version, with the states and transitions the earlier one had
 * and it lost put back, so a reader sees what was added, what was removed and what can no longer be reached.
 */
import type { MachineGraph, StateGraphEdge, StateGraphNode } from "@/machine/graph"

export type Change = "added" | "removed"

export interface Diffed {
  readonly graph: MachineGraph
  /** What changed, by state id and by edge id. Unchanged states and edges are left out. */
  readonly changes: ReadonlyMap<string, Change>
}

function allStates(state: StateGraphNode): Array<StateGraphNode> {
  return [state, ...state.children.flatMap(allStates)]
}

const edgeKey = (edge: StateGraphEdge) => `${edge.source}\u0000${edge.label}\u0000${edge.target}`

/** `after`, with what `before` had and `after` dropped put back, and every difference marked. */
export function diffGraphs(before: MachineGraph, after: MachineGraph): Diffed {
  // The machine may have been renamed: read `before`'s ids as `after`'s.
  const from = before.root.id
  const to = after.root.id
  const rename = (id: string) => (id === from || id.startsWith(`${from}.`) ? to + id.slice(from.length) : id)
  const renamed = (state: StateGraphNode): StateGraphNode => ({
    ...state,
    id: rename(state.id),
    initial: state.initial === undefined ? undefined : rename(state.initial),
    children: state.children.map(renamed)
  })
  const old = renamed(before.root)

  const changes = new Map<string, Change>()
  const afterIds = new Set(allStates(after.root).map((state) => state.id))
  const oldIds = new Set(allStates(old).map((state) => state.id))
  for (const id of afterIds) if (!oldIds.has(id)) changes.set(id, "added")

  // A removed state goes back where it was, under its old parent, with the children removed with it. A child that
  // lives on elsewhere (one with its own id, moved out) stays only where it is now.
  const parents = new Map(
    allStates(old).flatMap((state) => state.children.map((child) => [child.id, state.id] as const))
  )
  const gone = (state: StateGraphNode): StateGraphNode => ({
    ...state,
    children: state.children.filter((child) => !afterIds.has(child.id)).map(gone)
  })
  const removed = allStates(old)
    .filter((state) => !afterIds.has(state.id))
    .map(gone)
  for (const state of removed) for (const inner of allStates(state)) changes.set(inner.id, "removed")
  const restore = (state: StateGraphNode): StateGraphNode => ({
    ...state,
    children: [
      ...state.children.map(restore),
      ...removed.filter((gone) => parents.get(gone.id) === state.id && afterIds.has(state.id))
    ]
  })

  const oldEdges = before.edges.map((edge) => ({ ...edge, source: rename(edge.source), target: rename(edge.target) }))
  const oldKeys = new Set(oldEdges.map(edgeKey))
  const afterKeys = new Set(after.edges.map(edgeKey))
  for (const edge of after.edges) if (!oldKeys.has(edgeKey(edge))) changes.set(edge.id, "added")
  const lost = oldEdges
    .filter((edge) => !afterKeys.has(edgeKey(edge)))
    // Nothing to send: the machine on the page doesn't have it any more.
    .map((edge) => ({ ...edge, id: `removed:${edge.id}`, eventJson: undefined }))
  for (const edge of lost) changes.set(edge.id, "removed")

  return { graph: { ...after, root: restore(after.root), edges: [...after.edges, ...lost] }, changes }
}
