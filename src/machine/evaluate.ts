/**
 * Compiles and runs pasted TypeScript and collects every machine it creates, exported
 * or not, by wrapping the machine constructors the code imports.
 */
import * as XStateEffect from "@xstate/effect"
import * as EffectModule from "effect"
import { Effect, Option, Schema } from "effect"
import { transform } from "sucrase"
import * as XState from "xstate"

import { toJson } from "./json"
import { reviveSources } from "./revive"

import type { AnyStateMachine } from "xstate"

export class CompileError extends Schema.TaggedError<CompileError>()("CompileError", {
  message: Schema.String
}) {}

export class RunError extends Schema.TaggedError<RunError>()("RunError", {
  message: Schema.String
}) {}

export class NoMachineError extends Schema.TaggedError<NoMachineError>()("NoMachineError", {
  message: Schema.String
}) {}

export const compile = (code: string) =>
  Effect.try({
    try: () => transform(code, { transforms: ["typescript", "imports"], production: true }).code,
    catch: (cause) => new CompileError({ message: String(cause) })
  })

type Collect = (machine: AnyStateMachine) => void

/** What `setup(...)` and `setupEffect(...)` return: something with its own `createMachine`. */
interface MachineFactory {
  createMachine: (...args: Array<never>) => AnyStateMachine
}

/**
 * Report every machine built through `createMachine` or `machineFromJSON`, including the
 * `createMachine` on whatever `setup`/`setupEffect` return. User code is not type-checked here, so
 * the wrappers only need to forward arguments and see what comes back.
 */
function instrumented(collect: Collect) {
  const machine = (built: AnyStateMachine) => {
    collect(built)
    return built
  }
  const factory = <F extends MachineFactory>(built: F) => {
    const create = built.createMachine.bind(built)
    built.createMachine = (...args) => machine(create(...args))
    return built
  }
  return {
    xstate: {
      ...XState,
      createMachine: (...args: Parameters<typeof XState.createMachine>) => machine(XState.createMachine(...args)),
      setup: (...args: Parameters<typeof XState.setup>) => factory(XState.setup(...args)),
      machineFromJSON: (...[json, sources]: Parameters<typeof XState.machineFromJSON>) =>
        machine(XState.machineFromJSON(json, reviveSources(toJson(json), sources)))
    },
    xstateEffect: {
      ...XStateEffect,
      setupEffect: (...args: Parameters<typeof XStateEffect.setupEffect>) => factory(XStateEffect.setupEffect(...args))
    }
  }
}

const RUN_GRACE = "1 second"

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/** Compile and run `code`; succeed with every machine it created, in creation order. */
export const evaluate = (code: string) =>
  Effect.gen(function* () {
    const compiled = yield* compile(code)
    const machines: Array<AnyStateMachine> = []
    const collect: Collect = (machine) => {
      // Wrapped factories can report the same machine twice (setup().createMachine → createMachine).
      if (!machines.includes(machine)) machines.push(machine)
    }
    const { xstate, xstateEffect } = instrumented(collect)
    const modules = new Map<string, object>([
      ["xstate", xstate],
      ["@xstate/effect", xstateEffect],
      ["effect", EffectModule]
    ])
    const require = (name: string) => {
      const module = modules.get(name)
      if (module === undefined)
        throw new Error(`Cannot import "${name}" here; available: ${[...modules.keys()].join(", ")}`)
      return module
    }
    const exports = {}
    // Machines are usually created up front; top-level code after that (running an actor,
    // awaiting a result) is allowed to fail or hang without hiding them.
    const warning = yield* Effect.tryPromise({
      try: () => new AsyncFunction("require", "exports", "module", compiled)(require, exports, { exports }),
      catch: (cause) => new RunError({ message: cause instanceof Error ? cause.message : String(cause) })
    }).pipe(
      Effect.timeoutOption(RUN_GRACE),
      Effect.map((finished) =>
        Option.isNone(finished) ? `Top-level code was still running after ${RUN_GRACE}.` : undefined
      ),
      Effect.catchTag("RunError", (error) =>
        machines.length > 0 ? Effect.succeed(`Top-level code threw: ${error.message}`) : Effect.fail(error)
      )
    )
    if (machines.length === 0) {
      return yield* new NoMachineError({ message: "No machine found. Call createMachine (or setup().createMachine)." })
    }
    const exported = new Map(Object.entries(exports).map(([name, value]) => [value, name]))
    return { machines: machines.map((machine) => ({ machine, name: exported.get(machine) })), warning }
  })
