/**
 * Machine files in and out. An imported definition (MachineJSON or a Mermaid state diagram) becomes a module, so
 * share links, autosave and the editor treat it like any other code.
 */
import { Effect, Schema } from "effect"

import { machineFromMermaid } from "../mermaid/mermaid"

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

/** TypeScript for a Mermaid state diagram: the machine it describes. */
export const codeFromMermaid = (text: string, fileName: string) =>
  Effect.try({
    try: () => machineFromMermaid(text),
    catch: (error) =>
      new DefinitionError({ message: `${fileName}: ${error instanceof Error ? error.message : String(error)}` })
  })
