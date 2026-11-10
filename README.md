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

## Embed a statechart in your docs

`<autoviz-statechart>` is the canvas on its own: the diagram, event pills and simulation, without the editor. Load one script, then write the machine inside the tag:

```html
<script type="module" src="https://YOUR-DEPLOYMENT/embed/embed.js"></script>

<autoviz-statechart>
  <script type="text/typescript">
    import { createMachine } from "xstate"
    export const toggle = createMachine({
      id: "toggle",
      initial: "off",
      states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { TOGGLE: { target: "off" } } } }
    })
  </script>
</autoviz-statechart>
```

The inner `<script type="text/typescript">` keeps the source as raw text, so `<` and `>` in TypeScript survive, and the browser neither runs it nor shows it. Or point at a file: `<autoviz-statechart src="/machines/checkout.ts">`.

**Markdown docs need one tag.** Add `<meta name="autoviz-fences" content="on">` to the page's `<head>`, and every fenced block tagged `statechart` becomes a chart. That covers markdown-it, marked, Shiki and Expressive Code (Starlight) output, and pages a single-page app renders later. Fences run their code with your page's origin, so leave the tag off pages where visitors write Markdown:

````md
```statechart
import { createMachine } from "xstate"
export const door = createMachine({ id: "door", initial: "closed", states: { closed: {}, open: {} } })
```
````

| Attribute | |
| --- | --- |
| `src` | URL of a machine module (`.ts`/`.js`) or a MachineJSON file (`.json`). |
| `code` | The machine's source as a string. Takes precedence over the inner script and `src`. |
| `machine` | Id of the machine to show when the code creates several. Defaults to the first. |
| `theme` | `auto` (default: follows the reader's system setting), `light` or `dark`. |
| `events` | Event types to send before the chart shows, space-separated: `events="ADD_ITEM CHECKOUT"` opens at `address`. |
| `walkthrough` | Steps to walk through, as JSON: `[{"event":"SUBMIT","note":"take payment"}]`. Adds previous, play and next under the chart, with each step's note. |
| `autoplay` | Steps through the walkthrough on its own. Readers who ask for less motion step themselves. |

A chart with an `id` writes its walkthrough step to the URL (`#checkout/2`), so a link opens the walkthrough at that step. An event the machine doesn't accept, or a `machine` id it doesn't create, shows an error in the chart.

The chart shows states and events only, with no title bar or breadcrumb, so it leaves the machine's name to your page. On a docs page the mouse wheel and a one-finger swipe scroll the page; drag with the mouse, or use two fingers, to pan and zoom the chart. In a narrow container the chart lays out top to bottom. Charts load as they near the viewport, so a page with ten charts pays only for the ones read. The element is 480px tall by default; give it any `height` in your CSS. It renders in a shadow root, so your page's styles don't reach in and its styles don't leak out. Each element runs its machine in its own Web Worker, the same sandbox the app uses. `embed.d.ts` and `embed.react.d.ts` next to `embed.js` type the element for TypeScript and JSX.

`pnpm build` builds the embed into `public/embed` first, so every deployment serves it at `/embed/`, with CORS open for other sites. To try it locally, run `pnpm build:embed`, serve the repo root, and open `embed-host.html`. Add `?from=http://localhost:PORT` to load the embed from a second origin.

### Where JavaScript can't run

A README, a pull request or an issue can't run the embed. **Save → SVG image** exports the chart as one self-contained SVG, and **Save → Animated SVG** exports every step you simulated since the last reset, ringing each active state in turn with a caption. Both follow the reader's light or dark setting, and readers who ask for less motion see the last step, still.

The exported SVGs for the examples are checked byte for byte in `e2e/goldens/<platform>/`, one set for macOS (`darwin`) and one for Linux, since Chromium measures text a pixel apart on each. A diff there changes what a reader sees: re-record with `UPDATE_GOLDENS=1 pnpm test:e2e e2e/svg-export.spec.ts`, then look at the changed files before committing them. When CI fails on a golden, its `playwright-report` artifact holds the SVGs Linux drew in `test-results/e2e/goldens/linux/`.

## Review machine changes in pull requests

The action in `action.yml` reviews every XState machine a pull request touched: TypeScript or JavaScript that calls `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, and MachineJSON files (`machineToJSON` output, or any `.json` with `states`). It runs each changed file at the base and the head, compares the machines, and posts one comment that it keeps up to date:

- a walkthrough table: each changed machine, with its states and transitions before → after
- checks: removed states and transitions, states nothing can enter any more, transition functions whose target it can't read, and files it couldn't run
- a statechart of each changed machine, which GitHub draws from Mermaid. Added states are green and unreachable ones amber, with a `diff` of the states and transitions
- with `app-url` set, an **Open in Autovisualizer** link to step through the new version

```yaml
permissions:
  contents: read
  pull-requests: write
steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with: { node-version: 24 }
  - uses: jagreehal/autovisualizer@main
    with:
      path: src/machines            # optional pathspecs
      app-url: https://YOUR-DEPLOYMENT  # optional
      fail-on-regression: true      # optional: fail when a machine lost a state or transition
```

Removed states or transitions, and newly unreachable states, make the merge risk high. A target it can't read, or a file it couldn't run, makes it moderate. The action builds the review from its own source on first use, which takes about a minute. Run it locally with `pnpm build:review && node dist/review/cli.mjs --base main`.

The review runs the machine files, the same as your tests do. Imports other than `xstate`, `@xstate/effect` and `effect` get stand-ins, so a machine can import its own actions and helpers. Use the `pull_request` trigger. The action refuses `pull_request_target`, which would run a fork's code with a write token. `.github/workflows/statechart-review.yml` runs it on this repo.

## Skills

`skills/` holds agent skills for this project: `embed-statechart` covers the web component, and `statechart-review` covers the pull-request action.

## How it works

| File | Job |
| --- | --- |
| `src/machine/evaluate.ts` | Strips TypeScript with sucrase and runs the code in a Web Worker. The code can import `xstate`, `@xstate/effect` and `effect`. |
| `src/machine/graph.ts` | Turns a live machine into the graph the canvas draws. It reads transition functions from the `@code` text that `machineToJSON` produces. |
| `src/machine/simulate.ts` | Steps the machine with XState's pure `initialTransition` and `transition`, so no actor, timer or effect runs. |
| `src/machine/client.ts` | Effect service in front of the worker. If the worker doesn't answer within 5 seconds (an infinite loop, say), the service replaces it. |
| `src/machine/definition.ts`, `revive.ts` | MachineJSON import and export. An imported file becomes a `machineFromJSON(...)` call with a TypeScript evaluator for `@code`. Named actors get stand-ins that never finish, named actions do nothing, and named guards pass. |
| `src/canvas` | ELK lays the chart out and React Flow renders it. |
| `src/review` | The pull-request review: git diff, both sides evaluated in Node, machines diffed, markdown and Mermaid rendered. |
| `src/storage/document.ts` | Share links in the URL hash, autosave in localStorage, files on disk. |

The stack is TanStack Start with Nitro. The app runs in the browser today; the server half is where accounts and remote saves will go.

## Accounts and database (Neon)

`neon.ts` declares the Neon services: Postgres and Neon Auth (Managed Better Auth). `.neon` links the project and branch, and `neon deploy` applies `neon.ts` and writes the connection variables to `.env.local` (see `.env.example`).

- The browser signs in with `@neon/auth` against the branch's Auth URL. `vite.config.ts` passes `NEON_AUTH_BASE_URL` to the client, so you keep one copy of it.
- `GET /api/health` runs a query through `pg` on the pooled `DATABASE_URL`. On Vercel, `attachDatabasePool` closes idle clients before an instance suspends.
- `GET /api/me` checks the user's Neon Auth JWT against the JWKS (issuer and audience) and reads the user from `neon_auth.user`. A request without a valid token gets a 401.
- Without the Neon variables (CI, forks), the app runs local-only and hides sign-in.

`pnpm start` runs the production build with `.env.local` loaded.

## Tests

`src/machine/machine.test.ts` covers evaluation, graph extraction, simulation and the MachineJSON round trip with Vitest.

`e2e/` follows the playwright-cookbook conventions. Specs import `test` from `e2e/fixtures.ts` and never construct objects. Page and component objects in `e2e/pages` and `e2e/components` own the selectors. Locators use named roles: each state is a `group` named after the state, with `aria-current` while active, and each event pill is a button named after its event. An automatic fixture fails any test whose page logs a console error or throws.

## Licence

Apache-2.0. `src/examples/approval.ts` and `src/examples/parallel.ts` come from the XState repository under the MIT licence; see [NOTICE](NOTICE).
