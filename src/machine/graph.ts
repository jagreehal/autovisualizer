/**
 * Turns a live xstate v6 machine into a plain, serializable graph the canvas
 * can lay out. Runs in the worker, where the machine object lives.
 *
 * v6 transition functions (`on: { submit: ({ event }) => ({ target: 'x' }) }`)
 * have no static target, so `toDirectedGraph` drops them. `machineToJSON` keeps
 * their source as `@code` text; we read literal `target: '...'` strings out of it,
 * mark those edges as `inferred`, and report functions with none in `unresolved`.
 */
import { Schema } from "effect"
import { machineToJSON } from "xstate"

import { field, isJsonArray, isJsonObject, isString, toJson } from "./json"

import type { Json } from "./json"
import type { AnyEventObject, AnyStateMachine, AnyStateNode, AnyTransitionDefinition } from "xstate"

export const StateKind = Schema.Literals(["atomic", "compound", "parallel", "final", "history", "choice"])

export interface StateGraphNode {
  readonly id: string
  readonly key: string
  readonly kind: typeof StateKind.Type
  readonly initial: string | undefined
  readonly invokes: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly description: string | undefined
  readonly children: ReadonlyArray<StateGraphNode>
}

export const StateGraphNode: Schema.Codec<StateGraphNode> = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  kind: StateKind,
  initial: Schema.UndefinedOr(Schema.String),
  invokes: Schema.Array(Schema.String),
  tags: Schema.Array(Schema.String),
  description: Schema.UndefinedOr(Schema.String),
  children: Schema.Array(Schema.suspend((): Schema.Codec<StateGraphNode> => StateGraphNode))
})

export const EdgeKind = Schema.Literals(["event", "always", "after", "done", "error"])

export const StateGraphEdge = Schema.Struct({
  id: Schema.String,
  source: Schema.String,
  target: Schema.String,
  /** JSON of the event that takes this edge; `undefined` for eventless (`always`) edges. */
  eventJson: Schema.UndefinedOr(Schema.String),
  label: Schema.String,
  kind: EdgeKind,
  /** Target read from a transition function body rather than the config. */
  inferred: Schema.Boolean,
  /** 1-based branch number when one transition function can go to several targets. */
  branch: Schema.UndefinedOr(Schema.Number)
})
export type StateGraphEdge = typeof StateGraphEdge.Type

export const UnresolvedTransition = Schema.Struct({
  source: Schema.String,
  label: Schema.String
})

export const MachineGraph = Schema.Struct({
  id: Schema.String,
  root: StateGraphNode,
  edges: Schema.Array(StateGraphEdge),
  unresolved: Schema.Array(UnresolvedTransition),
  /** The machine as XState's MachineJSON, pretty-printed, for export. */
  definitionJson: Schema.String
})
export type MachineGraph = typeof MachineGraph.Type

function toNode(stateNode: AnyStateNode): StateGraphNode {
  const children = Object.values(stateNode.states).map(toNode)
  const hasInitial = stateNode.type === "compound"
  return {
    id: stateNode.id,
    key: stateNode.key,
    kind: stateNode.type,
    initial: hasInitial ? stateNode.initial.target?.[0]?.id : undefined,
    invokes: stateNode.invoke.map((invoke) => invoke.src ?? invoke.id),
    tags: [...stateNode.tags],
    description: stateNode.description,
    children
  }
}

/** The event that takes `transition`: its type plus the payload pattern it matches (timer, actor id). */
export function eventFor(transition: AnyTransitionDefinition): AnyEventObject {
  return { type: String(transition.eventType), ...transition.matches }
}

export function describe(source: AnyStateNode, transition: AnyTransitionDefinition) {
  const eventType = String(transition.eventType)
  const actorId = transition.matches?.actorId
  const invokeName = source.invoke.find((invoke) => invoke.id === actorId)?.src ?? actorId
  switch (eventType) {
    case "":
      return { kind: "always", label: "always" } as const
    case "xstate.after":
      return { kind: "after", label: `after ${transition.matches?.delay}ms` } as const
    case "xstate.done.actor":
      return { kind: "done", label: `done: ${invokeName}` } as const
    case "xstate.error.actor":
      return { kind: "error", label: `error: ${invokeName}` } as const
    case "xstate.done.state":
      return { kind: "done", label: "onDone" } as const
    default:
      return { kind: "event", label: eventType } as const
  }
}

/** Every `@code` source inside a MachineJSON value. */
function codeSources(value: Json | undefined): Array<string> {
  if (isJsonArray(value)) return value.flatMap(codeSources)
  if (!isJsonObject(value)) return []
  const code = value["@code"]
  return [...(isString(code) ? [code] : []), ...Object.values(value).flatMap(codeSources)]
}

/** The MachineJSON slot that holds `transition`, inside its state's JSON. */
function slotFor(stateJson: Json | undefined, source: AnyStateNode, transition: AnyTransitionDefinition) {
  const type = String(transition.eventType)
  switch (type) {
    case "":
      return field(stateJson, "always")
    case "xstate.after":
      return field(field(stateJson, "after"), String(transition.matches?.delay))
    case "xstate.done.state":
      return field(stateJson, "onDone")
    case "xstate.done.actor":
    case "xstate.error.actor": {
      const index = source.invoke.findIndex((invoke) => invoke.id === transition.matches?.actorId)
      const invokes = field(stateJson, "invoke")
      const invoke = isJsonArray(invokes) ? invokes[index] : invokes
      return field(invoke, type === "xstate.done.actor" ? "onDone" : "onError")
    }
    default:
      return field(field(stateJson, "on"), type)
  }
}

const LITERAL_TARGET = /\btarget\s*:\s*(["'`])([^"'`$]+)\1/g

// ponytail: regex over the transition function's source text, so it misses targets built
// from variables or helpers; swap for effect-analyzer's AST extraction when that matters.
const literalTargets = (sources: ReadonlyArray<string>): Array<string> =>
  sources.flatMap((source) => [...source.matchAll(LITERAL_TARGET)].flatMap((match) => (match[2] ? [match[2]] : [])))

/** Resolve a target string the way xstate does: `#id`, `.child`, or a sibling path. */
function resolveTarget(machine: AnyStateMachine, source: AnyStateNode, target: string): AnyStateNode | undefined {
  const walk = (from: AnyStateNode | undefined, path: string) =>
    path.split(".").reduce<AnyStateNode | undefined>((node, key) => (key === "" ? node : node?.states[key]), from)
  try {
    if (target.startsWith("#")) {
      const [id = "", ...rest] = target.slice(1).split(".")
      return walk(machine.getStateNodeById(id), rest.join("."))
    }
    if (target.startsWith(".")) return walk(source, target.slice(1))
    return walk(source.parent ?? machine.root, target)
  } catch {
    return undefined
  }
}

function allNodes(stateNode: AnyStateNode): Array<AnyStateNode> {
  return [stateNode, ...Object.values(stateNode.states).flatMap(allNodes)]
}

/** `name` is the exported binding, used when the machine has no `id`. */
export function toMachineGraph(machine: AnyStateMachine, name: string | undefined): MachineGraph {
  const edges: Array<StateGraphEdge> = []
  const unresolved: Array<typeof UnresolvedTransition.Type> = []
  // XState's own definition contract: transition functions appear as `@code` source text,
  // for machines written in code and machines loaded with machineFromJSON alike.
  const definition = toJson(machineToJSON(machine))
  const stateJson = (node: AnyStateNode) =>
    node.path.reduce<Json | undefined>((json, key) => field(field(json, "states"), key), definition)

  for (const source of allNodes(machine.root)) {
    const transitions = [...[...source.transitions.values()].flat(), ...(source.always ?? [])]
    transitions.forEach((transition, index) => {
      const { kind, label } = describe(source, transition)
      const eventJson = kind === "always" ? undefined : JSON.stringify(eventFor(transition))
      const push = (target: AnyStateNode, inferred: boolean, n: number, branch: number | undefined) =>
        edges.push({
          id: `${source.id}:${index}:${n}`,
          source: source.id,
          target: target.id,
          eventJson,
          label,
          kind,
          inferred,
          branch
        })

      if (transition.to === undefined) {
        // A targetless transition stays in its state: draw it as a self-loop.
        ;(transition.target ?? [source]).forEach((target, n) => push(target, false, n, undefined))
        return
      }
      const targets = literalTargets(codeSources(slotFor(stateJson(source), source, transition))).flatMap((target) => {
        const node = resolveTarget(machine, source, target)
        return node ? [node] : []
      })
      if (targets.length === 0) unresolved.push({ source: source.id, label })
      const distinct = [...new Map(targets.map((node) => [node.id, node])).values()]
      distinct.forEach((node, n) => push(node, true, n, distinct.length > 1 ? n + 1 : undefined))
    })
  }

  return {
    id: machine.id || name || "machine",
    root: toNode(machine.root),
    edges,
    unresolved,
    definitionJson: JSON.stringify(definition, null, 2)
  }
}

/**
 * States nothing can enter: no incoming edge, not their parent's initial state, and
 * not a parallel region. Children of an unreachable state are unreachable too.
 */
export function unreachableStates(graph: MachineGraph): ReadonlySet<string> {
  const entered = new Set(graph.edges.filter((edge) => edge.source !== edge.target).map((edge) => edge.target))
  const result = new Set<string>()
  const visit = (state: StateGraphNode, parent: StateGraphNode | undefined, parentUnreachable: boolean) => {
    const reachable =
      parent === undefined ||
      (!parentUnreachable && (parent.kind === "parallel" || parent.initial === state.id || entered.has(state.id)))
    if (!reachable) result.add(state.id)
    for (const child of state.children) visit(child, state, !reachable)
  }
  visit(graph.root, undefined, false)
  return result
}
