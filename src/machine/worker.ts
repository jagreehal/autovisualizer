/**
 * Runs pasted code away from the page. Holds the live machines and the current
 * simulation snapshot; everything that crosses back is plain decoded data.
 */
import { Effect, Schema } from "effect"

import { evaluate } from "./evaluate"
import { toMachineGraph } from "./graph"
import { Request, Response } from "./protocol"
import { JsonObject, start, step, view } from "./simulate"

import type { AnyMachineSnapshot, AnyStateMachine } from "xstate"

class SimulationError extends Schema.TaggedError<SimulationError>()("SimulationError", {
  message: Schema.String
}) {}

const decodeInput = Schema.decodeUnknownEffect(Schema.fromJsonString(JsonObject))
const decodeEvent = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.StructWithRest(Schema.Struct({ type: Schema.String }), [JsonObject]))
)

let machines: ReadonlyArray<AnyStateMachine> = []
let current: { machine: AnyStateMachine; snapshot: AnyMachineSnapshot } | undefined

const attempt = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => new SimulationError({ message: String(cause) }) })

const handle = (request: Request): Effect.Effect<Response, { readonly message: string; readonly _tag: string }> => {
  switch (request._tag) {
    case "Load":
      return evaluate(request.code).pipe(
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
        const snapshot = yield* attempt(() => start(machine, input))
        current = { machine, snapshot }
        return { _tag: "Simulated", id: request.id, view: view(snapshot, true) }
      })
    case "Send":
      return Effect.gen(function* () {
        if (current === undefined) return yield* new SimulationError({ message: "Start the machine first" })
        const { machine, snapshot } = current
        const event = yield* decodeEvent(request.eventJson)
        const [next, handled] = yield* attempt(() => step(machine, snapshot, event))
        current = { machine, snapshot: next }
        return { _tag: "Simulated", id: request.id, view: view(next, handled) }
      })
  }
}

const decodeRequest = Schema.decodeUnknownEffect(Request)

self.addEventListener("message", (message: MessageEvent<Request>) => {
  const program = decodeRequest(message.data).pipe(
    Effect.flatMap(handle),
    Effect.catch((error) =>
      Effect.succeed({
        _tag: "Failed",
        id: message.data.id,
        reason: error._tag,
        message: error.message
      })
    )
  )
  void Effect.runPromise(program).then((response) => self.postMessage(response))
})
