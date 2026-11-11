/**
 * Stand-ins for every named actor, action and guard a MachineJSON definition refers to, so it can be drawn and
 * stepped without its runtime. No code runs here: `@code`/`@expr` text needs revive.ts, in the worker.
 *
 * Stand-ins never matter for drawing. For simulation, invoked actors never finish on their own (send their
 * done/error events), actions do nothing, and named guards pass.
 */
import { createAsyncLogic } from "xstate/actors"

import { eachObject, isString } from "./json"

import type { Json } from "./json"
import type { machineFromJSON } from "xstate"

export type MachineSources = NonNullable<Parameters<typeof machineFromJSON>[1]>

/** Names a definition refers to: invoked actors, custom actions and named guards. */
function referencedNames(json: Json | undefined) {
  const names = { actors: new Set<string>(), actions: new Set<string>(), guards: new Set<string>() }
  eachObject(json, (object, key) => {
    const name = key === "invoke" ? object["src"] : object["type"]
    if (!isString(name) || name.startsWith("@xstate.")) return
    if (key === "invoke") names.actors.add(name)
    else if (key === "guard") names.guards.add(name)
    else if (key === "entry" || key === "exit" || key === "actions") names.actions.add(name)
  })
  return names
}

/** `given` plus a stand-in for every other name in `names`. */
const standIns = <V>(names: ReadonlySet<string>, given: Record<string, V> | undefined, standIn: V) => ({
  ...Object.fromEntries([...names].map((name) => [name, standIn])),
  ...given
})

const neverSettles = createAsyncLogic({ run: () => new Promise<never>(() => {}) })

/** `given`, plus a stand-in for each actor, action and guard the definition names and `given` doesn't supply. */
export function standInSources(json: Json | undefined, given: MachineSources | undefined): MachineSources {
  const names = referencedNames(json)
  return {
    ...given,
    actors: standIns(names.actors, given?.actors, neverSettles),
    actions: standIns(names.actions, given?.actions, () => {}),
    guards: standIns(names.guards, given?.guards, () => true)
  }
}
