/**
 * The page's handle on the machine worker. Each request gets an id and a
 * Deferred; a request that does not answer in time (an infinite loop in pasted
 * code) replaces the worker, so one bad paste never wedges the app.
 */
import { Context, Deferred, Effect, Layer, Schema } from "effect"

import { Response } from "./protocol"

import type { Request } from "./protocol"

export class WorkerError extends Schema.TaggedError<WorkerError>()("WorkerError", {
  reason: Schema.String,
  message: Schema.String
}) {}

type Answer<Tag extends Response["_tag"]> = Extract<Response, { _tag: Tag }>
type Pending = Deferred.Deferred<Response, WorkerError>
type Body = Request extends infer R ? (R extends Request ? Omit<R, "id"> : never) : never

const TIMEOUT = "5 seconds"
const decodeResponse = Schema.decodeUnknownSync(Response)

export class MachineWorker extends Context.Service<
  MachineWorker,
  {
    readonly load: (code: string) => Effect.Effect<Answer<"Loaded">, WorkerError>
    readonly start: (machine: number, inputJson: string) => Effect.Effect<Answer<"Simulated">, WorkerError>
    readonly send: (eventJson: string) => Effect.Effect<Answer<"Simulated">, WorkerError>
  }
>()("MachineWorker") {
  static readonly layer = Layer.effect(
    MachineWorker,
    Effect.gen(function* () {
      const pending = new Map<number, Pending>()
      let nextId = 0

      const spawn = () => {
        const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
        worker.addEventListener("message", (message: MessageEvent<Response>) => {
          const response = decodeResponse(message.data)
          const deferred = pending.get(response.id)
          if (deferred === undefined) return
          pending.delete(response.id)
          Deferred.doneUnsafe(
            deferred,
            response._tag === "Failed"
              ? Effect.fail(new WorkerError({ reason: response.reason, message: response.message }))
              : Effect.succeed(response)
          )
        })
        return worker
      }
      let worker = spawn()
      yield* Effect.addFinalizer(() => Effect.sync(() => worker.terminate()))

      const restart = Effect.sync(() => {
        worker.terminate()
        worker = spawn()
      })

      const request = <Tag extends Response["_tag"]>(body: Body, expect: Tag) =>
        Effect.gen(function* () {
          const id = nextId++
          const deferred = yield* Deferred.make<Response, WorkerError>()
          pending.set(id, deferred)
          worker.postMessage({ ...body, id })
          const response = yield* Deferred.await(deferred).pipe(
            Effect.timeoutOrElse({
              duration: TIMEOUT,
              orElse: () =>
                restart.pipe(
                  Effect.andThen(
                    new WorkerError({ reason: "Timeout", message: `No answer in ${TIMEOUT}; the code was stopped.` })
                  )
                )
            }),
            Effect.ensuring(Effect.sync(() => pending.delete(id)))
          )
          if (response._tag !== expect) {
            return yield* new WorkerError({ reason: "Protocol", message: `Expected ${expect}, got ${response._tag}` })
          }
          // SAFETY: the `_tag` check above narrows the union member at runtime.
          return response as Answer<Tag>
        })

      return MachineWorker.of({
        load: (code) => request({ _tag: "Load", code }, "Loaded"),
        start: (machine, inputJson) => request({ _tag: "Start", machine, inputJson }, "Simulated"),
        send: (eventJson) => request({ _tag: "Send", eventJson }, "Simulated")
      })
    })
  )
}
