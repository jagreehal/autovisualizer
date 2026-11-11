/**
 * The simulation behind a chart: load machines, start one, send it events. Everything that crosses back is plain
 * decoded data, so the same engine answers in the worker and on the page.
 */
import { Effect, Schema } from "effect"

import { toMachineGraph } from "./graph"
import { JsonEvent } from "./json"
import { JsonObject, restore, start, step, view } from "./simulate"

import type { Request, Response } from "./protocol"
import type { AnyMachineSnapshot, AnyStateMachine } from "xstate"

class SimulationError extends Schema.TaggedError<SimulationError>()("SimulationError", {
  message: Schema.String
}) {}

const decodeInput = Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObject))
const decodeEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(JsonEvent))

const attempt = <A>(run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) => new SimulationError({ message: cause instanceof Error ? cause.message : String(cause) })
  })

/** Answers one request from the page. */
export type Engine = (request: Request) => Effect.Effect<Response, { readonly message: string; readonly _tag: string }>

/** Machines from a Load request's code, in the order they were created. */
export type Loader = (code: string) => Effect.Effect<
  {
    readonly machines: ReadonlyArray<{ readonly machine: AnyStateMachine; readonly name: string | undefined }>
    readonly warning: string | undefined
  },
  { readonly message: string; readonly _tag: string }
>

/**
 * Answers the page's requests: holds the loaded machines and the current simulation snapshot. The worker runs one
 * with `evaluate` (pasted code); the page runs one with a MachineJSON loader, which runs no code.
 */
export const engineFor = (load: Loader): Engine => {
  let machines: ReadonlyArray<AnyStateMachine> = []
  let current: { machine: AnyStateMachine; snapshot: AnyMachineSnapshot } | undefined
  return (request: Request): Effect.Effect<Response, { readonly message: string; readonly _tag: string }> => {
    switch (request._tag) {
      case "Load":
        return load(request.code).pipe(
          Effect.map((result) => {
            machines = result.machines.map((found) => found.machine)
            current = undefined
            return {
              _tag: "Loaded",
              id: request.id,
              machines: result.machines.map((found) => toMachineGraph(found.machine, found.name)),
              warning: result.warning
            }
          })
        )
      case "Start":
        return Effect.gen(function* () {
          const machine = machines[request.machine]
          if (machine === undefined) return yield* new SimulationError({ message: "Machine not loaded" })
          const input = yield* decodeInput(request.inputJson)
          const context = yield* decodeInput(request.contextJson)
          const persisted = request.snapshotJson
          const snapshot =
            persisted === undefined
              ? yield* attempt(() => start(machine, input, request.state, context))
              : yield* decodeInput(persisted).pipe(
                  Effect.flatMap((json) => attempt(() => restore(machine, json))),
                  Effect.mapError(
                    (error) => new SimulationError({ message: `The snapshot can't be restored: ${error.message}` })
                  )
                )
          current = { machine, snapshot }
          return { _tag: "Simulated", id: request.id, view: view(snapshot, true) }
        })
      case "Send":
        return Effect.gen(function* () {
          if (current === undefined) return yield* new SimulationError({ message: "Start the machine first" })
          const { machine, snapshot } = current
          const event = yield* decodeEvent(request.eventJson)
          const [next, handled, taken] = yield* attempt(() => step(machine, snapshot, event))
          current = { machine, snapshot: next }
          return { _tag: "Simulated", id: request.id, view: view(next, handled, taken) }
        })
    }
  }
}
