/** Typed walking of JSON values, such as XState's MachineJSON definitions. */
import { Schema } from "effect"

export type Json = typeof Schema.Json.Type

export const toJson = Schema.decodeUnknownSync(Schema.Json)
export const isString = Schema.is(Schema.String)
export const isJsonArray = Schema.is(Schema.Array(Schema.Json))
export const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Json))

export const field = (value: Json | undefined, key: string): Json | undefined =>
  isJsonObject(value) ? value[key] : undefined

/** Visit every object in `value` together with the key it sits under. */
export function eachObject(
  value: Json | undefined,
  visit: (object: Record<string, Json>, key: string) => void,
  key = ""
) {
  if (isJsonArray(value)) {
    for (const item of value) eachObject(item, visit, key)
    return
  }
  if (!isJsonObject(value)) return
  visit(value, key)
  for (const [child, inner] of Object.entries(value)) eachObject(inner, visit, child)
}
