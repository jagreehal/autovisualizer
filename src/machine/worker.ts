/**
 * Runs pasted code away from the page: the engine with `evaluate` as its loader.
 */
import { Effect, Schema } from "effect"

import { engineFor } from "./engine"
import { evaluate } from "./evaluate"
import { Request } from "./protocol"

const handle = engineFor(evaluate)

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
