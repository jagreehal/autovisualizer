# Autovisualizer

**See and step through your XState machines: in the browser, in your docs, and in every pull request.**

<p align="center"><img src=".github/demo.svg" alt="A checkout statechart stepping from idle through cart, address and payment to confirmed" width="100%"></p>

<p align="center"><strong><a href="https://auto-visualizer.vercel.app">Try it in your browser →</a></strong> Paste a machine, get its statechart.</p>

Your XState machine already describes a diagram. Autovisualizer draws it from the code, for XState v6 and `@xstate/effect`, and lets you click through it:

- **Docs that run.** One script tag puts a live statechart in a docs site, blog or Markdown page. Your readers send events and watch the machine move.
- **Reviews that show the change.** A GitHub Action comments on each pull request that touches a machine, with a before → after statechart and a warning when a state or transition goes away.
- **v6 guards drawn.** XState v6 moves guards into transition functions. Autovisualizer reads the targets out of each function and draws them as numbered branches.
- **One source of truth.** The chart comes from the code you already have, so it stays in step with it.

Autovisualizer is an independent community project.

## Put a statechart in your docs

Load the script once, then write the machine inside the tag:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/autovisualizer/public/embed/embed.js"></script>

<auto-visualizer>
  <script type="text/typescript">
    import { createMachine } from "xstate"
    export const toggle = createMachine({
      id: "toggle",
      initial: "off",
      states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { TOGGLE: { target: "off" } } } }
    })
  </script>
</auto-visualizer>
```

Pin a version (`autovisualizer@0.1.0`) to keep a published page on the release you tested.

The inner `<script type="text/typescript">` keeps the source as raw text, so `<` and `>` in TypeScript survive, and the browser neither runs it nor shows it. Or point at a file: `<auto-visualizer src="/machines/checkout.ts">`.

**A machine as data needs no worker.** Give a chart an XState MachineJSON definition (from Stately or `machineToJSON`) in `<script type="application/json">`, and it is drawn and stepped on the page: nothing runs, so it works on a page opened from disk and in sandboxed iframes, where a chart written as code can't start its worker. Several charts can share one definition, each with its own walkthrough:

```html
<script type="application/json" id="checkout">{ "id": "checkout", "initial": "cart", "states": { … } }</script>
<auto-visualizer definition="#checkout" walkthrough='[{"event":"CHECKOUT"}]'></auto-visualizer>
<auto-visualizer definition="#checkout" state="payment"></auto-visualizer>
```

A definition with `@code` or `@expr` carries code, so it runs in the worker like any other.

**Markdown docs need one tag.** Add `<meta name="auto-visualizer-fences" content="on">` to the page's `<head>`, and every fenced block tagged `statechart` becomes a chart. That covers markdown-it, marked, Shiki and Expressive Code (Starlight) output, and pages a single-page app renders later. Fences run their code with your page's origin, so leave the tag off pages where visitors write Markdown:

````md
```statechart
import { createMachine } from "xstate"
export const door = createMachine({ id: "door", initial: "closed", states: { closed: {}, open: {} } })
```
````

**Tell a machine's story.** A walkthrough steps through events with a note for each, and a chart with an `id` deep-links to a step (`#checkout/2`), whether the link opens the page or is followed on it:

```html
<auto-visualizer
  id="checkout"
  src="/machines/checkout.ts"
  events="ADD_ITEM"
  walkthrough='[{"event":"CHECKOUT","note":"the cart is ready, ask for an address"},{"event":"SUBMIT","note":"take payment"},{"event":"PAID","note":"done"}]'
></auto-visualizer>
```

| Attribute | |
| --- | --- |
| `src` | URL of a machine module (`.ts`/`.js`) or a MachineJSON file (`.json`). |
| `code` | The machine's source as a string. Takes precedence over the inner script, `definition` and `src`. |
| `definition` | The machine as MachineJSON, drawn with no worker. The JSON itself, or `#id` of an element holding it (usually a `<script type="application/json">`). A `<script type="application/json">` inside the tag sets it too. Takes precedence over `src`. |
| `machine` | Id of the machine to show when the code creates several. Defaults to the first. |
| `theme` | `auto` (default: follows the reader's system setting), `light` or `dark`. |
| `state` | The state to open in, by path (`payment.processing`) or full id (`checkout.payment.processing`). For a parallel state, name one state per region, space-separated: `state="upload.done review.pending"`. The chart starts the machine as if its initial states led there: it skips the usual initial route, then enters the named state with its entry actions, eventless (`always`) transitions and done events, so a state that passes straight through opens where it lands. An unknown state shows an error that lists the machine's states. |
| `input` | The machine's input, as JSON: `input='{"items":2}'`. |
| `context` | Context to start with, as JSON, laid over the machine's own: `context='{"retries":2}'` changes `retries` and keeps the rest. Guards see it, and entry actions can still change it. Works with or without `state`. |
| `snapshot` | Resume exactly where an actor left off: the JSON from `actor.getPersistedSnapshot()`. Its state, context, history and pending timers come back as they were, and no entry actions run again, which `state` and `context` can't promise. Wins over both. A snapshot that doesn't fit the machine (another machine's id or version, or a state it doesn't have) shows why. |
| `events` | Events to send before the chart shows, space-separated: `events="ADD_ITEM CHECKOUT"` opens at `address`. For events that carry data, write a JSON array of names and whole events: `events='["ADD_ITEM",{"type":"xstate.done.actor.pay","output":{"id":"tx_1"}}]'`. |
| `walkthrough` | Steps to walk through, as JSON: `[{"event":"SUBMIT","note":"take payment"}]`. Adds previous, play and next under the chart, with each step's note. An event that carries data is written whole: `{"event":{"type":"xstate.done.actor.pay","output":{"id":"tx_1"}}}`. |
| `autoplay` | Steps through the walkthrough on its own. Readers who ask for less motion step themselves. |
| `counts` | How often each transition was taken, as JSON keyed by state then event: `{"payment":{"PAID":120,"DECLINED":0}}`. Each count shows on its event, and a transition taken 0 times is drawn dashed: a path the code allows that nothing took. Name a state by its key or its full id (`checkout.payment`). |
| `direction` | `auto` (default), `right` or `down`. `auto` lays the chart out both ways and keeps the one that shows it larger in its space: a long chain goes top to bottom in a wide column, a wide machine left to right in a short box, and a small machine that fits either way goes right. |

An event the machine doesn't accept, or a `machine` id it doesn't create, shows an error in the chart.

The events `events` and a walkthrough send are drawn as a path: each transition they took is highlighted, so a walkthrough that replays a real run shows its whole route, not only where it ended.

From React, set `walkthrough`, `counts`, `input` and `context` as JSON strings with `setAttribute` (or as attributes in markup). React renders before `embed.js` defines the element, so an object passed as a prop arrives as the text `[object Object]`.

The chart shows states and events only, so it leaves the machine's name to your page. The mouse wheel and a one-finger swipe scroll the page; drag with the mouse, or use two fingers, to pan and zoom the chart. Charts load as they near the viewport, so a page with ten charts loads the ones your readers reach. Without a `height` in your CSS, the element sizes itself to the chart, between 240px and 720px tall plus the walkthrough bar, so a phone gets a short box instead of a tiny chart in empty space. A `height` in your CSS overrides that. It renders in a shadow root, so your page's styles don't reach in and its styles don't leak out. A chart written as code runs it in its own Web Worker, which needs the page served over HTTP; a chart from a definition runs on the page. `embed.d.ts` and `embed.react.d.ts` next to `embed.js` type the element for TypeScript and JSX.

### In READMEs, issues and pull requests

GitHub can't run the element, so give it an image. Put each chart in your Markdown as an SVG link with its source in a collapsed `<details>` block below it:

````md
![Door statechart](docs/door.svg)
<details><summary>Statechart source</summary>

```statechart walkthrough='[{"event":"OPEN","note":"someone knocks"}]'
import { createMachine } from "xstate"
export const door = createMachine({ id: "door", initial: "closed", states: { closed: { on: { OPEN: { target: "open" } } }, open: {} } })
```
</details>
````

Then let the action draw the images. With `render`, it finds each chart, draws it with the same export as the app, and commits the SVGs that changed. A chart with a `walkthrough` becomes an animated SVG. Attributes on the fence line are the element's own (`walkthrough`, `events`, `state`, `direction`), and source that starts with `{` is MachineJSON:

```yaml
on:
  pull_request:
    paths: ['**/*.md']
permissions:
  contents: write
jobs:
  statecharts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { ref: '${{ github.head_ref }}' }
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - uses: jagreehal/autovisualizer@main
        with:
          render: README.md docs/guide.md
```

It draws in the runner's Chrome. To render locally, build the CLI and the embed from an Autovisualizer checkout (`pnpm build:review && pnpm build:embed`), then run `node /path/to/autovisualizer/dist/review/cli.mjs render README.md`.

You can also export by hand. In [the app](https://auto-visualizer.vercel.app), **Save → SVG image** exports the chart as one self-contained SVG, and **Save → Animated SVG** exports every step you simulated since the last reset, like the demo above. Both follow the reader's light or dark setting, and readers who ask for less motion see the last step as a still image.

From your own docs build, ask a chart on your page for its walkthrough as an animated SVG: `await element.toAnimatedSvg({ title, stepMs, direction })` (`direction` is `right`, the default, or `down`). It returns the SVG text, a frame per step, captioned with the step's event and note, so keep notes short. Call it from a headless browser once the chart has loaded:

```js
const chart = page.locator("auto-visualizer#checkout")
await chart.getByRole("group").first().waitFor()
const svg = await chart.evaluate((element) => element.toAnimatedSvg({ title: "Checkout" }))
```

## Review machine changes in pull requests

Add the action, and every pull request that touches an XState machine gets one comment, kept up to date:

- a walkthrough table: each changed machine, with its states and transitions before → after
- checks: removed states and transitions, states nothing can enter any more, transition functions whose target it can't read, and files it couldn't run
- a statechart of each changed machine, which GitHub draws from Mermaid. Added states are green and unreachable ones amber, with a `diff` of the states and transitions

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
      fail-on-regression: true      # optional: fail when a machine lost a state or transition
```

It compares the pull request with the commit it branched from, so changes that landed on the base branch since then stay out of the review. It finds machines in TypeScript or JavaScript that call `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, and in MachineJSON files (`machineToJSON` output, or any `.json` with `states`). Removed states or transitions, and states that became unreachable, make the merge risk high. A target it can't read, or a file it couldn't run, makes it moderate. The first run takes about a minute.

The review runs the machine files, the same as your tests do. Imports other than `xstate`, `@xstate/effect` and `effect` get stand-ins, so a machine can import its own actions and helpers. Use the `pull_request` trigger. The action refuses `pull_request_target`, which would run a fork's code with a write token.

## The editor

Paste a machine into [the app](https://auto-visualizer.vercel.app) and you get its statechart, with:

- **Every machine in your code.** It finds each machine your code builds with `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, exported or not.
- **Guard branches.** Literal targets in transition functions are drawn as dashed, numbered branches. When a function computes its target (`target: pick(event.to)`), the Validations panel names it.
- **Step-through simulation.** Click an event pill and the machine takes that transition. You fire invoked actors and timers yourself: send `done: deploy` or `after 30000ms` when you want them. Add a payload with a custom event, and set the machine's input before a reset.
- **Problems flagged.** Unreachable states get a warning badge, and the Validations panel lists them with the transitions it can't draw.
- **Outcomes at a glance.** Final states draw green. Tag a final state `error` or `failure` (`tags: ["error"]`) and it draws red, in the editor, embeds and SVG exports.
- **Sharing.** Share a link that carries the code. Save the code as `.ts`, or export XState's MachineJSON. Open either kind of file. Your code autosaves in the browser.

## Agent skills

`skills/` holds agent skills: `embed-statechart` writes `<auto-visualizer>` embeds, and `statechart-review` sets up the pull-request action.

## Licence

Apache-2.0. `src/examples/approval.ts` and `src/examples/parallel.ts` come from the XState repository under the MIT licence; see [NOTICE](NOTICE).
