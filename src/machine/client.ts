/**
 * The page's handle on the machine worker. Each request gets an id and a
 * Deferred; a request that does not answer in time (an infinite loop in pasted
 * code) replaces the worker, so one bad paste never wedges the app.
 */
import { Context, Deferred, Effect, Layer, Schema } from "effect"

import { Response } from "./protocol"

import type { Request } from "./protocol"
import type { Engine } from "./engine"

export class WorkerError extends Schema.TaggedError<WorkerError>()("WorkerError", {
  reason: Schema.String,
  message: Schema.String
}) {}

type Answer<Tag extends Response["_tag"]> = Extract<Response, { _tag: Tag }>
type Pending = Deferred.Deferred<Response, WorkerError>
type Body = Request extends infer R ? (R extends Request ? Omit<R, "id"> : never) : never

const TIMEOUT = "5 seconds"
const decodeResponse = Schema.decodeUnknownSync(Response)

/**
 * Why a worker never started. The usual cause is a page opened from disk: its origin is `null`, and browsers
 * won't start a worker from another origin (the CDN) for it.
 */
export const workerFailure = (detail: string) =>
  new WorkerError({
    reason: "WorkerUnavailable",
    message:
      location.protocol === "file:"
        ? "This chart runs its code in a Web Worker, which browsers don't allow on a page opened from disk. " +
          "Serve the page over HTTP (npx serve .), or give the chart a MachineJSON definition, which needs no worker."
        : `This chart's Web Worker didn't start${detail ? `: ${detail}` : ""}.`
  })

export class MachineWorker extends Context.Service<
  MachineWorker,
  {
    readonly load: (code: string) => Effect.Effect<Answer<"Loaded">, WorkerError>
    readonly start: (
      machine: number,
      inputJson: string,
      state?: string,
      contextJson?: string,
      snapshotJson?: string
    ) => Effect.Effect<Answer<"Simulated">, WorkerError>
    readonly send: (eventJson: string) => Effect.Effect<Answer<"Simulated">, WorkerError>
  }
>()("MachineWorker") {
  static readonly layer = Layer.effect(
    MachineWorker,
    Effect.gen(function* () {
      const pending = new Map<number, Pending>()
      let nextId = 0

      // Set when the worker failed to start: every request fails at once with why, not after the timeout.
      let failed: WorkerError | undefined
      const failAll = (error: WorkerError) => {
        failed = error
        for (const deferred of pending.values()) Deferred.doneUnsafe(deferred, Effect.fail(error))
        pending.clear()
      }

      const spawn = (): Worker | undefined => {
        failed = undefined
        let worker: Worker
        try {
          worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
        } catch (cause) {
          // Some browsers refuse a cross-origin worker synchronously.
          failAll(workerFailure(cause instanceof Error ? cause.message : String(cause)))
          return undefined
        }
        // A worker that can't load its script reports here, and would otherwise never answer.
        worker.addEventListener("error", (event) => {
          event.preventDefault()
          failAll(workerFailure(event.message))
        })
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
      yield* Effect.addFinalizer(() => Effect.sync(() => worker?.terminate()))

      const restart = Effect.sync(() => {
        worker?.terminate()
        worker = spawn()
      })

      const request = <Tag extends Response["_tag"]>(body: Body, expect: Tag) =>
        Effect.gen(function* () {
          if (failed !== undefined || worker === undefined) return yield* failed ?? workerFailure("")
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
        start: (machine, inputJson, state = "", contextJson = "{}", snapshotJson) =>
          request(
            snapshotJson === undefined
              ? { _tag: "Start", machine, inputJson, state, contextJson }
              : { _tag: "Start", machine, inputJson, state, contextJson, snapshotJson },
            "Simulated"
          ),
        send: (eventJson) => request({ _tag: "Send", eventJson }, "Simulated")
      })
    })
  )

  /**
   * The same service answered on the page, for MachineJSON definitions that carry no code (in-page.ts). It needs no
   * worker, so it works where one can't start. The engine loads on first use.
   */
  static readonly inPage = Layer.effect(
    MachineWorker,
    Effect.gen(function* () {
      const { pageEngine } = yield* Effect.promise(() => import("./in-page"))
      const handle: Engine = pageEngine()
      let nextId = 0
      const request = <Tag extends Response["_tag"]>(body: Body, expect: Tag) =>
        handle({ ...body, id: nextId++ }).pipe(
          Effect.mapError((error) => new WorkerError({ reason: error._tag, message: error.message })),
          Effect.flatMap((response) =>
            response._tag === expect
              ? // SAFETY: the `_tag` check narrows the union member at runtime.
                Effect.succeed(response as Answer<Tag>)
              : Effect.fail(
                  new WorkerError({ reason: "Protocol", message: `Expected ${expect}, got ${response._tag}` })
                )
          )
        )
      return MachineWorker.of({
        load: (code) => request({ _tag: "Load", code }, "Loaded"),
        start: (machine, inputJson, state = "", contextJson = "{}", snapshotJson) =>
          request(
            snapshotJson === undefined
              ? { _tag: "Start", machine, inputJson, state, contextJson }
              : { _tag: "Start", machine, inputJson, state, contextJson, snapshotJson },
            "Simulated"
          ),
        send: (eventJson) => request({ _tag: "Send", eventJson }, "Simulated")
      })
    })
  )
}
