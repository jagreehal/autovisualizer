/**
 * MachineJSON files in and out. An imported definition becomes a one-line module, so
 * share links, autosave and the editor treat it like any other code.
 */
import { Effect, Schema } from "effect"

export class DefinitionError extends Schema.TaggedError<DefinitionError>()("DefinitionError", {
  message: Schema.String
}) {}

const parse = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)))
const identifier = (name: string) => name.replace(/[^A-Za-z0-9_$]/g, "_").replace(/^(?=\d)/, "_") || "machine"

/** TypeScript that revives `jsonText` with `machineFromJSON`, named after its `id` or the file. */
export const codeFromDefinition = (jsonText: string, fileName: string) =>
  parse(jsonText).pipe(
    Effect.mapError((error) => new DefinitionError({ message: `${fileName} is not a JSON object: ${error.message}` })),
    Effect.map((json) => {
      const id = json["id"]
      const name = identifier(Schema.is(Schema.String)(id) ? id : fileName.replace(/(\.machine)?\.json$/, ""))
      return [
        `import { machineFromJSON } from "xstate"`,
        ``,
        `// Imported from ${fileName}`,
        `export const ${name} = machineFromJSON(${JSON.stringify(json, null, 2)})`,
        ``
      ].join("\n")
    })
  )
