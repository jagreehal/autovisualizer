/** Messages between the page and the machine worker, decoded on both sides. */
import { Schema } from "effect"

import { MachineGraph } from "./graph"
import { SimView } from "./simulate"

export const Request = Schema.Union([
  Schema.TaggedStruct("Load", { id: Schema.Number, code: Schema.String }),
  Schema.TaggedStruct("Start", {
    id: Schema.Number,
    machine: Schema.Number,
    inputJson: Schema.String,
    /** Space-separated states to open in; empty for the initial state. */
    state: Schema.String,
    contextJson: Schema.String
  }),
  Schema.TaggedStruct("Send", { id: Schema.Number, eventJson: Schema.String })
])
export type Request = typeof Request.Type

export const Response = Schema.Union([
  Schema.TaggedStruct("Loaded", {
    id: Schema.Number,
    machines: Schema.Array(MachineGraph),
    warning: Schema.UndefinedOr(Schema.String)
  }),
  Schema.TaggedStruct("Simulated", { id: Schema.Number, view: SimView }),
  Schema.TaggedStruct("Failed", { id: Schema.Number, reason: Schema.String, message: Schema.String })
])
export type Response = typeof Response.Type
