/**
 * The engine on the page, for MachineJSON definitions. A definition is data: it is revived with stand-ins and stepped
 * with xstate's pure transitions, so nothing runs that needs a worker's isolation. That lets a chart draw where
 * workers can't start: a page opened from disk, a sandboxed iframe. Loaded on first use, so charts written as code
 * never download it. A definition that carries `@code`/`@expr` goes to the worker instead (see carriesCode).
 */
import { Effect, Schema } from "effect"
import { machineFromJSON } from "xstate"

import { engineFor } from "./engine"
import { carriesCode } from "./json"
import { standInSources } from "./stand-ins"

class DefinitionError extends Schema.TaggedError<DefinitionError>()("DefinitionError", {
  message: Schema.String
}) {}

const parse = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)))

const loadDefinition = (text: string) =>
  parse(text).pipe(
    Effect.mapError(
      (error) => new DefinitionError({ message: `The definition isn't a JSON object: ${error.message}` })
    ),
    Effect.filterOrFail(
      (json) => !carriesCode(json),
      () => new DefinitionError({ message: "This definition carries code (@code or @expr): it runs in the worker." })
    ),
    Effect.flatMap((json) =>
      Effect.try({
        try: () => machineFromJSON(json, standInSources(json, undefined)),
        catch: (cause) => new DefinitionError({ message: cause instanceof Error ? cause.message : String(cause) })
      })
    ),
    Effect.map((machine) => ({ machines: [{ machine, name: undefined }], warning: undefined }))
  )

/** A fresh engine: each chart holds its own simulation. */
export const pageEngine = () => engineFor(loadDefinition)
