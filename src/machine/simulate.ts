/**
 * Pure stepping through a machine with xstate's `initialTransition`/`transition`.
 * Nothing executes: no invoked actors, timers or effects run, so the visualizer can
 * walk any machine without its services. Timers and actor results are taken by
 * sending their events (`xstate.after.*`, `xstate.done.actor.*`) like any other.
 */
import { Schema } from "effect"
import { describe, eventFor } from "./graph"
import { getNextTransitions, initialTransition, isUnhandled, transition } from "xstate"

import type { AnyEventObject, AnyMachineSnapshot, AnyStateMachine } from "xstate"

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
  handled: Schema.Boolean
})
export type SimView = typeof SimView.Type

const toJson = (value: AnyMachineSnapshot["context"]) => {
  try {
    return JSON.stringify(value, null, 2) ?? "undefined"
  } catch {
    return "(not serializable)"
  }
}

export function view(snapshot: AnyMachineSnapshot, handled: boolean): SimView {
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
    handled
  }
}

export function start(machine: AnyStateMachine, input: JsonObject): AnyMachineSnapshot {
  const [snapshot] = initialTransition(machine, input)
  return snapshot
}

export function step(
  machine: AnyStateMachine,
  snapshot: AnyMachineSnapshot,
  event: AnyEventObject
): readonly [AnyMachineSnapshot, boolean] {
  const result = transition(machine, snapshot, event)
  return [result[0], !isUnhandled(snapshot, result)]
}
