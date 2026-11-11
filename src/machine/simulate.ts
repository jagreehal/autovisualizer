/**
 * Pure stepping through a machine with xstate's `initialTransition`/`transition`.
 * Nothing executes: no invoked actors, timers or effects run, so the visualizer can
 * walk any machine without its services. Timers and actor results are taken by
 * sending their events (`xstate.after.*`, `xstate.done.actor.*`) like any other.
 */
import { Schema } from "effect"
import { allNodes, describe, eventFor, transitionId } from "./graph"
import { getMicrosteps, getNextTransitions, initialTransition, isUnhandled, StateMachine } from "xstate"

import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine, AnyStateNode, Snapshot } from "xstate"

/** Machine input or event payload: any JSON object. */
export const JsonObject = Schema.Record(Schema.String, Schema.Json)
export type JsonObject = typeof JsonObject.Type

export const SimView = Schema.Struct({
  status: Schema.String,
  /** Ids of every active state node, ancestors included. */
  active: Schema.Array(Schema.String),
  /** Events the active states listen for, in document order, as sendable JSON. */
  nextEvents: Schema.Array(Schema.Struct({ label: Schema.String, eventJson: Schema.String })),
  valueJson: Schema.String,
  contextJson: Schema.String,
  /** False when the last event was not handled by any active state. */
  handled: Schema.Boolean,
  /** The transitions the last event took, eventless and raised ones included, with the targets each went to. */
  taken: Schema.Array(Schema.Struct({ transition: Schema.String, targets: Schema.Array(Schema.String) }))
})
export type SimView = typeof SimView.Type

const toJson = (value: AnyMachineSnapshot["context"]) => {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined"
  } catch {
    return "(not serializable)"
  }
}

export function view(snapshot: AnyMachineSnapshot, handled: boolean, taken: SimView["taken"] = []): SimView {
  const nextEvents = new Map(
    getNextTransitions(snapshot)
      .filter((t) => t.eventType !== "")
      .map((t) => {
        const eventJson = JSON.stringify(eventFor(t))
        return [eventJson, { label: describe(t.source, t).label, eventJson }] as const
      })
  )
  return {
    status: snapshot.status,
    active: snapshot.nodes.map((node) => node.id),
    nextEvents: [...nextEvents.values()],
    valueJson: toJson(snapshot.value),
    contextJson: toJson(snapshot.context),
    handled,
    taken
  }
}

/** A state's path from the root, from its full id (`checkout.payment`) or its path (`payment`). */
function pathOf(machine: AnyStateMachine, name: string): ReadonlyArray<string> {
  const node = allNodes(machine.root).find((n) => n !== machine.root && (n.id === name || n.path.join(".") === name))
  if (node === undefined) {
    const known = allNodes(machine.root)
      .slice(1)
      .map((n) => n.path.join("."))
    throw new Error(`No state "${name}" in ${machine.id}. Its states: ${known.join(", ")}`)
  }
  return node.path
}

type MachineConfig = AnyStateMachine["config"]
type ContextFactory = (args: never) => JsonObject

const isContextFactory = (context: MachineConfig["context"]): context is ContextFactory => context instanceof Function

/** `config` with each state on `path` starting at the next one, so the machine starts there. */
function startingAt(config: MachineConfig, node: AnyStateNode, path: ReadonlyArray<string>): MachineConfig {
  const [key, ...rest] = path
  const child = key === undefined ? undefined : node.states[key]
  if (key === undefined || child === undefined) return config
  const states = { ...config.states, [key]: startingAt(config.states?.[key] ?? {}, child, rest) }
  // A parallel state enters every region already; only its regions get an initial.
  return node.type === "parallel" ? { ...config, states } : { ...config, initial: key, states }
}

/**
 * The machine's first snapshot. `state` opens it elsewhere: space-separated states, one per
 * parallel region if you like, as paths or full ids. It starts as if the machine's initial states
 * led there: the original initial route doesn't run, but the named states are entered like any
 * other, entry actions, eventless transitions and done events included. `context` is laid over the
 * machine's own before it starts, so guards see it and entry actions can still change it.
 */
export function start(
  machine: AnyStateMachine,
  input: JsonObject,
  state = "",
  context: JsonObject = {}
): AnyMachineSnapshot {
  const names = state.split(/\s+/).filter(Boolean)
  if (names.length === 0 && Object.keys(context).length === 0) return initialTransition(machine, input)[0]
  const own = machine.config.context
  const config = names
    .map((name) => pathOf(machine, name))
    .reduce((config, path) => startingAt(config, machine.root, path), {
      ...machine.config,
      context: (args: never) => ({ ...(isContextFactory(own) ? own(args) : own), ...context })
    })
  // The twin's snapshot belongs to the twin, whose initial states differ: re-resolve it on the real machine,
  // with history pointing at the real machine's states.
  const [reached] = initialTransition(new StateMachine(config, machine.sources, machine.validator), input)
  const nodes = new Map(allNodes(machine.root).map((node) => [node.id, node]))
  const historyValue = Object.fromEntries(
    Object.entries(reached.historyValue ?? {}).map(([id, states]) => [
      id,
      states.flatMap((state) => nodes.get(state.id) ?? [])
    ])
  )
  const { value, context: reachedContext, status, output, error } = reached
  return machine.resolveState({ value, context: reachedContext, historyValue, status, output, error })
}

/**
 * The snapshot an actor persisted (`getPersistedSnapshot()`), exactly where it left off: value, context, history,
 * children and pending timers. Unlike `start`, nothing is entered again, so no entry actions run. xstate checks the
 * snapshot fits the machine (its id, version and states) and says what doesn't.
 */
export function restore(machine: AnyStateMachine, persisted: JsonObject): AnyMachineSnapshot {
  // AnyStateMachine types restoreSnapshot as optional; a StateMachine always has it, with an inert scope by default.
  if (!(machine instanceof StateMachine)) throw new Error(`${machine.id} can't restore a snapshot`)
  return machine.restoreSnapshot(snapshotFrom(persisted))
}

/** Persisted JSON as xstate's Snapshot: its status says which of output and error it carries. */
function snapshotFrom(json: JsonObject): Snapshot<unknown> {
  const { status } = json
  switch (status) {
    case "active":
    case "stopped":
      return { ...json, status, output: undefined, error: undefined }
    case "done":
      return { ...json, status, output: json["output"], error: undefined }
    case "error":
      return { ...json, status, output: undefined, error: json["error"] }
    default:
      throw new Error(`A persisted snapshot's status is active, done, error or stopped, not ${JSON.stringify(status)}`)
  }
}

/** One evaluation of the event: transition functions and guards run once, and the trace matches the snapshot. */
export function step(
  machine: AnyStateMachine,
  snapshot: AnyMachineSnapshot,
  event: AnyEventObject
): readonly [AnyMachineSnapshot, boolean, SimView["taken"]] {
  // `transition()` rejects events its schemas don't allow; getMicrosteps doesn't check, so check here.
  if (machine.validator?.check({ kind: "event", logic: machine, event, eventOrigin: "external" }))
    return [snapshot, false, []]
  const microsteps = getMicrosteps(machine, snapshot, event)
  const next = microsteps.at(-1)?.[0] ?? snapshot
  const handled = !isUnhandled(snapshot, [next, microsteps.flatMap(([, actions]) => actions)])
  const taken = microsteps.flatMap(([, , transitions]) =>
    transitions.map((t) => ({ transition: transitionId(t), targets: (t.target ?? []).map((node) => node.id) }))
  )
  return [next, handled, taken]
}
