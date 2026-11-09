# Autovisualizer

Paste an XState v6 or `@xstate/effect` machine and you get its statechart. Click an event on the chart and the machine takes it. Autovisualizer is a community project with no connection to XState or Stately.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm test:e2e   # Playwright against the production build on :3100
pnpm quality    # types, oxlint, oxfmt, unit tests, build, e2e
```

## What you can do

- **Draw machines from code.** Autovisualizer finds every machine your code builds with `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, exported or not.
- **See v6 guard branches.** XState v6 moves guards into transition functions, and `toDirectedGraph` skips those edges. Autovisualizer reads the literal targets out of each function and draws them as dashed, numbered branches. When a function computes its target (`target: pick(event.to)`), the Validations panel names it.
- **Step through a machine.** Click an event pill and the machine takes that transition. Invoked actors and timers never fire on their own: you send `done: deploy` or `after 30000ms` when you want them. Add a payload with a custom event, and set the machine's input before a reset.
- **Spot problems.** Unreachable states get a warning badge, and the Validations panel lists them with the transitions it can't draw.
- **Move machines around.** Share a link that carries the code. Save the code as `.ts`, or export XState's MachineJSON. Open either kind of file. Your code autosaves in the browser.

## How it works

| File | Job |
| --- | --- |
| `src/machine/evaluate.ts` | Strips TypeScript with sucrase and runs the code in a Web Worker. The code can import `xstate`, `@xstate/effect` and `effect`. |
| `src/machine/graph.ts` | Turns a live machine into the graph the canvas draws. It reads transition functions from the `@code` text that `machineToJSON` produces. |
| `src/machine/simulate.ts` | Steps the machine with XState's pure `initialTransition` and `transition`, so no actor, timer or effect runs. |
| `src/machine/client.ts` | Effect service in front of the worker. If the worker doesn't answer within 5 seconds (an infinite loop, say), the service replaces it. |
| `src/machine/definition.ts`, `revive.ts` | MachineJSON import and export. An imported file becomes a `machineFromJSON(...)` call with a TypeScript evaluator for `@code`. Named actors get stand-ins that never finish, named actions do nothing, and named guards pass. |
| `src/canvas` | ELK lays the chart out and React Flow renders it. |
| `src/storage/document.ts` | Share links in the URL hash, autosave in localStorage, files on disk. |

The stack is TanStack Start with Nitro, the same as money-transfer-effect. The app runs in the browser today; the server half is where accounts and remote saves will go.

## Tests

`src/machine/machine.test.ts` covers evaluation, graph extraction, simulation and the MachineJSON round trip with Vitest.

`e2e/` follows the playwright-cookbook conventions. Specs import `test` from `e2e/fixtures.ts` and never construct objects. Page and component objects in `e2e/pages` and `e2e/components` own the selectors. Locators use named roles: each state is a `group` named after the state, with `aria-current` while active, and each event pill is a button named after its event. An automatic fixture fails any test whose page logs a console error or throws.

## Licence

Apache-2.0. `src/examples/approval.ts` and `src/examples/parallel.ts` come from the XState repository under the MIT licence; see [NOTICE](NOTICE).
