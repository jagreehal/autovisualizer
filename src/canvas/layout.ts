/**
 * Lays a machine graph out with ELK and turns the result into React Flow nodes and
 * edges. Nodes keep parent-relative positions so React Flow can nest them; edges
 * come back in root coordinates, routed orthogonally, and are drawn as ELK placed them.
 *
 * Each transition's pill is a node of its own, `source → pill → target`: ELK spaces pills like
 * states, so no pill covers another pill, a state or a line.
 */
import { FONT, SIZE, ancestry, pillHome, wrap } from "./geometry"

import type { Change } from "./diff"

import ELK from "elkjs/lib/elk.bundled.js"

import { unreachableStates } from "@/machine/graph"

import type { MachineGraph, StateGraphEdge, StateGraphNode } from "@/machine/graph"
import type { Edge, Node } from "@xyflow/react"
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js"

export interface Point {
  readonly x: number
  readonly y: number
}

export { FONT, SIZE }

export type Direction = "RIGHT" | "DOWN"

export interface StateNodeData extends Record<string, unknown> {
  readonly state: StateGraphNode
  readonly machineId: string
  readonly isRoot: boolean
  readonly isInitial: boolean
  /** A region of a parallel state: drawn dashed. */
  readonly isRegion: boolean
  readonly isUnreachable: boolean
  readonly hasUnresolved: boolean
}

export interface TransitionEdgeData extends Record<string, unknown> {
  readonly edge: StateGraphEdge
  readonly points: ReadonlyArray<Point>
  readonly label: Point & { readonly width: number; readonly height: number }
}

export type StateFlowNode = Node<StateNodeData, "state">
export type TransitionFlowEdge = Edge<TransitionEdgeData, "transition">

export interface Laidout {
  readonly nodes: ReadonlyArray<StateFlowNode>
  readonly edges: ReadonlyArray<TransitionFlowEdge>
}

const elk = new ELK()

/** React Flow ids must be non-empty; v6 gives an id-less machine root the id "". */
export const flowId = (stateId: string) => `s:${stateId}`

const context = document.createElement("canvas").getContext("2d")
function textWidth(text: string, font: string): number {
  if (context === null) return text.length * 8
  context.font = font
  return Math.ceil(context.measureText(text).width)
}

const chipWidth = (src: string) => textWidth(`invoke ${src}`, FONT.chip) + 38

/** A state's description as the lines it wraps to. */
export const descriptionLines = (state: StateGraphNode) =>
  wrap(state.description ?? "", SIZE.descriptionWidth, (line) => textWidth(line, FONT.description))

function leafSize(state: StateGraphNode) {
  const icon = state.kind === "final" ? SIZE.finalIcon + 8 : 0
  const chips = state.invokes.length * (SIZE.chipHeight + SIZE.chipGap)
  const lines = descriptionLines(state)
  return {
    // +6: both 2px borders plus a little slack for sub-pixel rounding.
    width: Math.max(
      72,
      textWidth(state.key, FONT.state) + icon + SIZE.leafPadX * 2 + 6,
      ...state.invokes.map((src) => chipWidth(src) + SIZE.leafPadX * 2 + 6),
      ...lines.map((line) => textWidth(line, FONT.description) + SIZE.leafPadX * 2 + 6)
    ),
    height:
      SIZE.leafHeight + (chips > 0 ? chips + 4 : 0) + (lines.length > 0 ? lines.length * SIZE.descriptionLine + 8 : 0)
  }
}

interface HeldPill {
  readonly node: ElkNode
  /** The child the pill comes after in model order; undefined puts it last. */
  readonly after: string | undefined
}

interface Placement {
  readonly machineId: string
  readonly direction: Direction
  readonly isRoot: boolean
  readonly isInitial: boolean
  /** False when the machine's box has no title bar (compact embeds). */
  readonly rootHeader: boolean
  /** The pill nodes each state holds, by state id, each with the child it follows. */
  readonly pills: ReadonlyMap<string, ReadonlyArray<HeldPill>>
}

function toElkNode(state: StateGraphNode, placement: Placement): ElkNode {
  const { machineId, direction, isRoot, isInitial, rootHeader, pills } = placement
  // The initial state goes in the first layer, so the chart reads from where it starts.
  const layer: Record<string, string> = {}
  if (isInitial) layer["elk.layered.layering.layerConstraint"] = "FIRST"
  const held = pills.get(state.id) ?? []
  if (state.children.length === 0 && held.length === 0)
    return { id: flowId(state.id), ...leafSize(state), layoutOptions: layer }
  const chips = state.invokes.length * (SIZE.chipHeight + SIZE.chipGap)
  // Chevron + padding, plus the MACHINE / PARALLEL tags drawn after the name.
  const tags = (isRoot ? 1 : 0) + (state.kind === "parallel" ? 1 : 0)
  const header = textWidth(state.key || machineId, FONT.parent) + 56 + tags * 72
  const headerHeight = isRoot && !rootHeader ? 0 : SIZE.headerHeight
  return {
    id: flowId(state.id),
    layoutOptions: {
      "elk.padding": `[top=${headerHeight + chips + SIZE.regionPad},left=${SIZE.regionPad},bottom=${SIZE.regionPad},right=${SIZE.regionPad}]`,
      "elk.nodeSize.constraints": "MINIMUM_SIZE",
      "elk.nodeSize.minimum": `(${headerHeight > 0 ? header : 0}, ${headerHeight + 40})`,
      // Parallel regions stack across the flow; everything else follows it.
      "elk.direction": state.kind === "parallel" ? (direction === "RIGHT" ? "DOWN" : "RIGHT") : direction,
      ...layer
    },
    // Each pill follows the earlier of its ends, so authoring order keeps it beside its states.
    children: [
      ...state.children.flatMap((child) => [
        toElkNode(child, {
          machineId,
          direction,
          isRoot: false,
          isInitial: state.initial === child.id,
          rootHeader,
          pills
        }),
        ...held.filter((pill) => pill.after === child.id).map((pill) => pill.node)
      ]),
      ...held.filter((pill) => pill.after === undefined).map((pill) => pill.node)
    ]
  }
}

/** Pills lead with a branch diamond, or an icon for timer and actor events. */
const pillIconWidth = (edge: StateGraphEdge) =>
  edge.branch !== undefined
    ? SIZE.diamond + 6
    : edge.kind === "after" || edge.kind === "done" || edge.kind === "error"
      ? SIZE.kindIcon + 6
      : 0

/** The count a page passed for an edge, drawn as a chip after its label. */
export const countWidth = (count: number | undefined) =>
  count === undefined ? 0 : textWidth(count.toLocaleString(), FONT.count) + SIZE.countPadX * 2 + 6

// +6: both 2px borders plus a little slack for sub-pixel rounding.
const pillWidth = (edge: StateGraphEdge, count: number | undefined) =>
  textWidth(edge.label, FONT.pill) + SIZE.pillPadX * 2 + pillIconWidth(edge) + countWidth(count) + 6

const pillId = (edge: StateGraphEdge) => `p:${edge.id}`

/**
 * The transition as two ELK edges, into its pill and out of it. A back transition goes in turned around, so ELK
 * lays it out as a forward one, with its pill between its states, not past them.
 */
const toElkEdges = (edge: StateGraphEdge, back: boolean): Array<ElkExtendedEdge> => {
  const [from, to] = back ? [edge.target, edge.source] : [edge.source, edge.target]
  return [
    { id: `${edge.id}:in`, sources: [flowId(from)], targets: [pillId(edge)] },
    { id: `${edge.id}:out`, sources: [pillId(edge)], targets: [flowId(to)] }
  ]
}

function parentsOf(state: StateGraphNode): Array<readonly [string, string]> {
  return state.children.flatMap((child) => [[child.id, state.id] as const, ...parentsOf(child)])
}

function indexStates(state: StateGraphNode): Array<readonly [string, StateGraphNode]> {
  return [[flowId(state.id), state], ...state.children.flatMap(indexStates)]
}

/**
 * `rootHeader` false leaves out the machine's title bar, for compact embeds. `counts` widens the pills that show one.
 * `changes` marks a diff's removed states and transitions, which don't count when finding what can be reached.
 */
export async function layout(
  graph: MachineGraph,
  direction: Direction,
  rootHeader = true,
  counts: ReadonlyMap<string, number> = new Map(),
  changes: ReadonlyMap<string, Change> = new Map()
): Promise<Laidout> {
  // Measure with the real fonts: load them explicitly, since nothing on the page may use them yet.
  // A font the page blocks (a Content Security Policy, offline) rejects; measure with the fallback stack.
  await Promise.all(Object.values(FONT).map((font) => document.fonts.load(font).catch(() => [])))
  const parents = new Map(parentsOf(graph.root))
  const states = new Map(indexStates(graph.root))
  const pills = new Map<string, Array<HeldPill>>()
  const back = new Set<string>()
  const loose: Array<ElkNode> = []
  for (const edge of graph.edges) {
    const node = { id: pillId(edge), width: pillWidth(edge, counts.get(edge.id)), height: SIZE.pillHeight }
    const home = pillHome(edge, parents)
    if (home === undefined) {
      loose.push(node)
      continue
    }
    // The children of home holding each end, in authoring order.
    const order = states.get(flowId(home))?.children.map((child) => child.id) ?? []
    const [from, to] = [edge.source, edge.target].map((end) =>
      order.indexOf(ancestry(end, parents).find((id) => parents.get(id) === home) ?? "")
    )
    // Against authoring order: a transition back to a state written earlier.
    if (from !== undefined && to !== undefined && to >= 0 && from > to) back.add(edge.id)
    const first = Math.min(...[from, to].filter((i) => i !== undefined && i >= 0))
    const after = order[first]
    pills.set(home, [...(pills.get(home) ?? []), { node, after }])
  }
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.json.edgeCoords": "ROOT",
      "elk.edgeRouting": "ORTHOGONAL",
      // Between a state and its pills: room for an arrowhead and a bend.
      "elk.layered.spacing.nodeNodeBetweenLayers": "36",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "14",
      "elk.spacing.nodeNode": "28",
      "elk.spacing.edgeNode": "20",
      "elk.spacing.edgeEdge": "14",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // Break cycles in authoring order so the flow starts at the initial state.
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER"
    },
    children: [
      toElkNode(graph.root, { machineId: graph.id, direction, isRoot: true, isInitial: false, rootHeader, pills }),
      ...loose
    ],
    edges: graph.edges.flatMap((edge) => toElkEdges(edge, back.has(edge.id)))
  })

  const unreachable = unreachableStates({
    ...graph,
    edges: graph.edges.filter((edge) => changes.get(edge.id) !== "removed")
  })
  const unresolved = new Set(graph.unresolved.map((u) => u.source))

  const flatten = (elkNode: ElkNode, parentId: string | undefined): Array<StateFlowNode> => {
    const state = states.get(elkNode.id)
    if (state === undefined) return []
    const parent = parentId === undefined ? undefined : states.get(parentId)
    const node: StateFlowNode = {
      id: elkNode.id,
      type: "state",
      position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
      width: elkNode.width,
      height: elkNode.height,
      parentId,
      draggable: false,
      // A parent's box spans its children's edges: let clicks through to the event
      // pills drawn over it. Its header opts back in (see StateNodeView).
      style: state.children.length > 0 ? { pointerEvents: "none" } : undefined,
      data: {
        state,
        machineId: graph.id,
        isRoot: parentId === undefined,
        isInitial: parent?.initial === state.id,
        isRegion: parent?.kind === "parallel",
        isUnreachable: unreachable.has(state.id) && changes.get(state.id) !== "removed",
        hasUnresolved: unresolved.has(state.id)
      }
    }
    return [node, ...(elkNode.children ?? []).flatMap((child) => flatten(child, elkNode.id))]
  }

  // Where ELK put each pill and routed each half, in root coordinates.
  const boxes = new Map<string, ElkNode & Point>()
  const visit = (elkNode: ElkNode, offset: Point) => {
    const at = { x: offset.x + (elkNode.x ?? 0), y: offset.y + (elkNode.y ?? 0) }
    boxes.set(elkNode.id, { ...elkNode, ...at })
    for (const child of elkNode.children ?? []) visit(child, at)
  }
  for (const child of result.children ?? []) visit(child, { x: 0, y: 0 })
  const sections = new Map<string, Array<Point>>()
  const collect = (elkNode: ElkNode) => {
    for (const elkEdge of elkNode.edges ?? []) {
      const section = elkEdge.sections?.[0]
      if (section !== undefined)
        sections.set(elkEdge.id, [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
    }
    for (const child of elkNode.children ?? []) collect(child)
  }
  collect(result)

  const edges = graph.edges.flatMap((edge): Array<TransitionFlowEdge> => {
    const halves = [sections.get(`${edge.id}:in`), sections.get(`${edge.id}:out`)]
    // A back transition was laid out turned around: turn its route back, so it ends at its target.
    const [into, out] = back.has(edge.id)
      ? halves.reverse().map((half) => (half === undefined ? undefined : [...half].reverse()))
      : halves
    const pill = boxes.get(pillId(edge))
    if (into === undefined || out === undefined || pill === undefined) return []
    return [
      {
        id: edge.id,
        type: "transition",
        source: flowId(edge.source),
        target: flowId(edge.target),
        selectable: false,
        // The two halves join under the pill, which hides the join.
        data: {
          edge,
          points: [...into, ...out],
          label: { x: pill.x, y: pill.y, width: pill.width ?? 0, height: pill.height ?? 0 }
        }
      }
    ]
  })
  return { nodes: (result.children ?? []).flatMap((child) => flatten(child, undefined)), edges }
}
