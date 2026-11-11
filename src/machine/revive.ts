/**
 * Sources for `machineFromJSON` so a pasted or imported MachineJSON definition can be
 * drawn and stepped without its runtime: `@code`/`@expr` text is compiled as TypeScript,
 * and every named actor, action or guard the definition refers to gets a stand-in (stand-ins.ts).
 *
 * Evaluating `@code` is running user-supplied code, the same as pasting TypeScript:
 * this module is only used from the machine worker, which has no DOM or storage access.
 *
 * Stand-ins never matter for drawing. For simulation, invoked actors never finish on
 * their own (send their done/error events), actions do nothing, and named guards pass.
 */
import { transform } from "sucrase"

import { standInSources } from "./stand-ins"

import type { Json } from "./json"
import type { MachineSources } from "./stand-ins"

type Evaluator = NonNullable<MachineSources["evaluators"]>[string]
type EvaluatorArgs = Parameters<Evaluator>[0]

// `new Function` returns the untyped `Function`; what it returns is the user's code.
const compiled = new Map<string, Function>()

/** Compile one TypeScript expression to a function of the scope's names. */
function compileExpression(source: string, names: ReadonlyArray<string>) {
  const key = `${names.join(",")}\u0000${source}`
  const cached = compiled.get(key)
  if (cached) return cached
  const js = transform(`(${source})`, { transforms: ["typescript"] }).code.replace(/;\s*$/, "")
  const fn = new Function(...names, `return (${js});`)
  compiled.set(key, fn)
  return fn
}

/** `@code` is a function taking `(scope, enq)`; `@expr` is an expression over the scope's names. */
const evaluateTypeScript: Evaluator = ({ source, kind, scope }: EvaluatorArgs) => {
  if (kind === "code") return compileExpression(source, [])()(scope, scope.enq)
  const names = Object.keys(scope)
  return compileExpression(source, names)(...names.map((name) => scope[name]))
}

export function reviveSources(json: Json | undefined, given: MachineSources | undefined): MachineSources {
  return {
    ...standInSources(json, given),
    evaluators: { ts: evaluateTypeScript, js: evaluateTypeScript, ...given?.evaluators }
  }
}
