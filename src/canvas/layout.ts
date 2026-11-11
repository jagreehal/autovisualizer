/**
 * Lays a machine graph out with ELK and turns the result into React Flow nodes and
 * edges. Nodes keep parent-relative positions so React Flow can nest them; edges
 * come back in root coordinates, routed orthogonally, and are drawn as ELK placed them.
 */
import { FONT, SIZE, placePills } from "./geometry"

import type { Rect } from "./geometry"
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

function leafSize(state: StateGraphNode) {
  const icon = state.kind === "final" ? SIZE.finalIcon + 8 : 0
  const chips = state.invokes.length * (SIZE.chipHeight + SIZE.chipGap)
  return {
    // +6: both 2px borders plus a little slack for sub-pixel rounding.
    width: Math.max(
      72,
      textWidth(state.key, FONT.state) + icon + SIZE.leafPadX * 2 + 6,
      ...state.invokes.map((src) => chipWidth(src) + SIZE.leafPadX * 2 + 6)
    ),
    height: SIZE.leafHeight + (chips > 0 ? chips + 4 : 0)
  }
}

interface Placement {
  readonly machineId: string
  readonly direction: Direction
  readonly isRoot: boolean
  readonly isInitial: boolean
  /** False when the machine's box has no title bar (compact embeds). */
  readonly rootHeader: boolean
}

function toElkNode(state: StateGraphNode, placement: Placement): ElkNode {
  const { machineId, direction, isRoot, isInitial, rootHeader } = placement
  // The initial state goes in the first layer, so the chart reads from where it starts.
  const layer: Record<string, string> = {}
  if (isInitial) layer["elk.layered.layering.layerConstraint"] = "FIRST"
  if (state.children.length === 0) return { id: flowId(state.id), ...leafSize(state), layoutOptions: layer }
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
    children: state.children.map((child) =>
      toElkNode(child, { machineId, direction, isRoot: false, isInitial: state.initial === child.id, rootHeader })
    )
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

function toElkEdge(edge: StateGraphEdge, count: number | undefined): ElkExtendedEdge {
  return {
    id: edge.id,
    sources: [flowId(edge.source)],
    targets: [flowId(edge.target)],
    labels: [{ text: edge.label, width: pillWidth(edge, count), height: SIZE.pillHeight }]
  }
}

function indexStates(state: StateGraphNode): Array<readonly [string, StateGraphNode]> {
  return [[flowId(state.id), state], ...state.children.flatMap(indexStates)]
}

/** `rootHeader` false leaves out the machine's title bar, for compact embeds. `counts` widens the pills that show one. */
export async function layout(
  graph: MachineGraph,
  direction: Direction,
  rootHeader = true,
  counts: ReadonlyMap<string, number> = new Map()
): Promise<Laidout> {
  // Measure with the real fonts: load them explicitly, since nothing on the page may use them yet.
  await Promise.all(Object.values(FONT).map((font) => document.fonts.load(font)))
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.json.edgeCoords": "ROOT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.edgeLabels.inline": "true",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "18",
      "elk.spacing.nodeNode": "48",
      "elk.spacing.edgeNode": "26",
      "elk.spacing.edgeEdge": "18",
      "elk.spacing.edgeLabel": "8",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // Break cycles in authoring order so the flow starts at the initial state.
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER"
    },
    children: [toElkNode(graph.root, { machineId: graph.id, direction, isRoot: true, isInitial: false, rootHeader })],
    edges: graph.edges.map((edge) => toElkEdge(edge, counts.get(edge.id)))
  })

  const states = new Map(indexStates(graph.root))
  const unreachable = unreachableStates(graph)
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
        isUnreachable: unreachable.has(state.id),
        hasUnresolved: unresolved.has(state.id)
      }
    }
    return [node, ...(elkNode.children ?? []).flatMap((child) => flatten(child, elkNode.id))]
  }

  // What pills must not cover, in root coordinates (the frame edges and pills are drawn in).
  const leaves = (elkNode: ElkNode, offset: Point, isTop: boolean): Array<Rect> => {
    const at = { x: offset.x + (elkNode.x ?? 0), y: offset.y + (elkNode.y ?? 0) }
    const children = elkNode.children ?? []
    // A parent blocks only its header; its body is where its children's edges and pills go.
    if (children.length > 0)
      return [
        ...(isTop && !rootHeader ? [] : [{ ...at, width: elkNode.width ?? 0, height: SIZE.headerHeight }]),
        ...children.flatMap((child) => leaves(child, at, false))
      ]
    return [{ ...at, width: elkNode.width ?? 0, height: elkNode.height ?? 0 }]
  }

  const byId = new Map(graph.edges.map((edge) => [edge.id, edge]))
  const routed = (result.edges ?? []).flatMap((elkEdge) => {
    const edge = byId.get(elkEdge.id)
    const section = elkEdge.sections?.[0]
    const label = elkEdge.labels?.[0]
    if (edge === undefined || section === undefined) return []
    return [
      {
        edge,
        points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
        label: { x: label?.x ?? 0, y: label?.y ?? 0, width: label?.width ?? 0, height: label?.height ?? 0 }
      }
    ]
  })
  const pills = placePills(
    routed,
    (result.children ?? []).flatMap((child) => leaves(child, { x: 0, y: 0 }, true))
  )
  const edges = routed.map(({ edge, points }, i): TransitionFlowEdge => ({
    id: edge.id,
    type: "transition",
    source: flowId(edge.source),
    target: flowId(edge.target),
    selectable: false,
    data: { edge, points, label: pills[i] ?? { x: 0, y: 0, width: 0, height: 0 } }
  }))
  return { nodes: (result.children ?? []).flatMap((child) => flatten(child, undefined)), edges }
}
