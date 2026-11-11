import type { MachineGraph, StateGraphEdge, StateGraphNode } from "@/machine/graph"
import type { SimView } from "@/machine/simulate"

/**
 * How often each transition was taken, as a page passes it: state, then event type, then a count.
 * A state is named by its key (`payment`) or its full id (`checkout.payment`); the id wins when both match.
 */
export type EdgeCounts = Readonly<Record<string, Readonly<Record<string, number>>>>

/** The event type an edge is taken on, or undefined for eventless (`always`) edges. */
export function eventType(edge: StateGraphEdge): string | undefined {
  if (edge.eventJson === undefined) return undefined
  const parsed: { readonly type?: string } = JSON.parse(edge.eventJson)
  return parsed.type
}

function stateKeys(state: StateGraphNode): Array<readonly [string, string]> {
  return [[state.id, state.key], ...state.children.flatMap(stateKeys)]
}

/** Each edge's count, by edge id. Edges the page gave no count for are left out, not shown as zero. */
export function countsByEdge(graph: MachineGraph, counts: EdgeCounts): ReadonlyMap<string, number> {
  const keys = new Map(stateKeys(graph.root))
  const result = new Map<string, number>()
  for (const edge of graph.edges) {
    const type = eventType(edge)
    if (type === undefined) continue
    const count = counts[edge.source]?.[type] ?? counts[keys.get(edge.source) ?? ""]?.[type]
    if (count !== undefined) result.set(edge.id, count)
  }
  return result
}

/**
 * The edges of the transitions one event took (`SimView.taken`). A transition function that can
 * go to several targets has one edge per branch: only the branch into the target it returned counts.
 */
export function takenEdges(graph: MachineGraph, taken: SimView["taken"]): ReadonlyArray<string> {
  return graph.edges
    .filter((edge) =>
      taken.some(
        (t) =>
          t.transition === edge.id.slice(0, edge.id.lastIndexOf(":")) &&
          (edge.branch === undefined || t.targets.includes(edge.target))
      )
    )
    .map((edge) => edge.id)
}
