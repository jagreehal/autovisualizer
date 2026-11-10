# Autovisualizer

**See and step through your XState machines: in the browser, in your docs, and in every pull request.**

<p align="center"><img src=".github/demo.svg" alt="A checkout statechart stepping from idle through cart, address and payment to confirmed" width="100%"></p>

<p align="center"><strong><a href="https://autovisualizer.vercel.app">Try it in your browser →</a></strong> Paste a machine, get its statechart.</p>

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

**Markdown docs need one tag.** Add `<meta name="auto-visualizer-fences" content="on">` to the page's `<head>`, and every fenced block tagged `statechart` becomes a chart. That covers markdown-it, marked, Shiki and Expressive Code (Starlight) output, and pages a single-page app renders later. Fences run their code with your page's origin, so leave the tag off pages where visitors write Markdown:

````md
```statechart
import { createMachine } from "xstate"
export const door = createMachine({ id: "door", initial: "closed", states: { closed: {}, open: {} } })
```
````

**Tell a machine's story.** A walkthrough steps through events with a note for each, and a chart with an `id` deep-links to a step (`#checkout/2`):

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
| `code` | The machine's source as a string. Takes precedence over the inner script and `src`. |
| `machine` | Id of the machine to show when the code creates several. Defaults to the first. |
| `theme` | `auto` (default: follows the reader's system setting), `light` or `dark`. |
| `events` | Event types to send before the chart shows, space-separated: `events="ADD_ITEM CHECKOUT"` opens at `address`. |
| `walkthrough` | Steps to walk through, as JSON: `[{"event":"SUBMIT","note":"take payment"}]`. Adds previous, play and next under the chart, with each step's note. |
| `autoplay` | Steps through the walkthrough on its own. Readers who ask for less motion step themselves. |

An event the machine doesn't accept, or a `machine` id it doesn't create, shows an error in the chart.

The chart shows states and events only, so it leaves the machine's name to your page. The mouse wheel and a one-finger swipe scroll the page; drag with the mouse, or use two fingers, to pan and zoom the chart. In a narrow container the chart lays out top to bottom. Charts load as they near the viewport, so a page with ten charts loads the ones your readers reach. The element is 480px tall by default; give it any `height` in your CSS. It renders in a shadow root, so your page's styles don't reach in and its styles don't leak out. Each chart runs its machine in its own Web Worker. `embed.d.ts` and `embed.react.d.ts` next to `embed.js` type the element for TypeScript and JSX.

### In READMEs, issues and pull requests

Export the chart as an image. In [the app](https://autovisualizer.vercel.app), **Save → SVG image** exports the chart as one self-contained SVG, and **Save → Animated SVG** exports every step you simulated since the last reset, like the demo above. Both follow the reader's light or dark setting, and readers who ask for less motion see the last step as a still image.

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

It finds machines in TypeScript or JavaScript that call `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, and in MachineJSON files (`machineToJSON` output, or any `.json` with `states`). Removed states or transitions, and states that became unreachable, make the merge risk high. A target it can't read, or a file it couldn't run, makes it moderate. The first run takes about a minute.

The review runs the machine files, the same as your tests do. Imports other than `xstate`, `@xstate/effect` and `effect` get stand-ins, so a machine can import its own actions and helpers. Use the `pull_request` trigger. The action refuses `pull_request_target`, which would run a fork's code with a write token.

## The editor

Paste a machine into [the app](https://autovisualizer.vercel.app) and you get its statechart, with:

- **Every machine in your code.** It finds each machine your code builds with `createMachine`, `setup().createMachine`, `setupEffect().createMachine` or `machineFromJSON`, exported or not.
- **Guard branches.** Literal targets in transition functions are drawn as dashed, numbered branches. When a function computes its target (`target: pick(event.to)`), the Validations panel names it.
- **Step-through simulation.** Click an event pill and the machine takes that transition. You fire invoked actors and timers yourself: send `done: deploy` or `after 30000ms` when you want them. Add a payload with a custom event, and set the machine's input before a reset.
- **Problems flagged.** Unreachable states get a warning badge, and the Validations panel lists them with the transitions it can't draw.
- **Sharing.** Share a link that carries the code. Save the code as `.ts`, or export XState's MachineJSON. Open either kind of file. Your code autosaves in the browser.

## Agent skills

`skills/` holds agent skills: `embed-statechart` writes `<auto-visualizer>` embeds, and `statechart-review` sets up the pull-request action.

## Licence

Apache-2.0. `src/examples/approval.ts` and `src/examples/parallel.ts` come from the XState repository under the MIT licence; see [NOTICE](NOTICE).
