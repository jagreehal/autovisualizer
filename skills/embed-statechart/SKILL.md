---
name: embed-statechart
description: Embed an interactive XState statechart in a docs site, blog or any HTML page with the <auto-visualizer> web component. Use when someone wants a machine diagram readers can click through, a guided walkthrough of a machine, or a ```statechart fence in Markdown to render as a chart.
---

# Embed a statechart

`<auto-visualizer>` draws an XState v6 or `@xstate/effect` machine and lets readers send events to it. It needs one script tag. It loads from the `autovisualizer` npm package on any CDN; pin a version (`autovisualizer@0.1.0`) to keep your docs on the release you tested.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/autovisualizer/public/embed/embed.js"></script>
```

## Give it a machine

Pick one source:

1. **Inline.** Put the code in a `<script type="text/typescript">` inside the tag. The browser keeps it as raw text, so TypeScript generics survive.

   ```html
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

2. **A file.** `<auto-visualizer src="/machines/checkout.ts">`. A `.json` URL loads XState MachineJSON.
3. **A definition.** Put XState MachineJSON in a `<script type="application/json">` inside the tag. The chart draws and steps it on the page with no Web Worker, so it works on a page opened from disk and in sandboxed iframes. Several charts can share one: give the script an `id` and write `definition="#checkout"` on each chart. A definition with `@code` or `@expr` runs that code in the worker.
4. **Markdown.** Add `<meta name="auto-visualizer-fences" content="on">` to the page's `<head>`, and a fenced block tagged `statechart` becomes a chart. This covers markdown-it, marked, Shiki and Expressive Code (Starlight), including pages a single-page app renders later. Fences run their code with the page's origin: leave the tag off pages where visitors write Markdown, such as comments or wikis.

The code may import `xstate`, `@xstate/effect` and `effect`. When it creates several machines, pick one with `machine="id"`.

## Tell a story

- `events="ADD_ITEM CHECKOUT"` sends events before the chart shows, so it opens partway through. Events that carry data go in a JSON array: `events='["ADD_ITEM",{"type":"xstate.done.actor.pay","output":{"id":"tx_1"}}]'`.
- `state="payment.processing"` opens the chart in that state, by path or full id. For a parallel state, name one state per region, space-separated. Reach for it when events alone would take a long story to get there. The chart enters the state as if the machine's initial states led there, with its entry actions, eventless transitions and done events, so a state that passes straight through opens where it lands.
- `input='{"items":2}'` sets the machine's input. `context='{"retries":2}'` lays fields over the machine's context before it starts, so guards see them. It works with or without `state`.
- `snapshot='{…}'` resumes an actor where it left off. Pass the JSON from `actor.getPersistedSnapshot()`. State, context, history and pending timers come back as they were, and entry actions don't run again. It wins over `state` and `context`.
- `walkthrough='[{"event":"SUBMIT","note":"take payment"}]'` adds previous, play and next controls with a note per step. An event with data is written whole: `{"event":{"type":"xstate.done.actor.pay","output":{"id":"tx_1"}},"note":"paid"}`.
- `autoplay` steps through the walkthrough by itself. Readers who prefer reduced motion step by hand.
- Narrate it: `speak` reads each note with the browser's voice (`voice`, `rate`). `audio-src="audio/{step}.wav"` plays a recorded clip per step; record them from `element.getSteps()` with any speech model, such as Phonon through ai-sdk-ollama. `element.narrate = async (step) => urlOrBlob` voices steps live. Autoplay waits for each step's audio, and the `step` event fires on every step.
- Give the element an `id` and each step lands in the URL (`#checkout/2`). Share that link to open the walkthrough at that step, or link to it from the same page.

## Fit it to the page

- The chart has no title bar or breadcrumb. Name the machine in the page's prose or heading.
- Readers scroll past a chart with the wheel or one finger. Mouse drag, or two fingers on a touch screen, pans and zooms it.
- `direction` is `auto`, `right` or `down`. `auto` lays the chart out both ways and keeps the one that shows it larger.
- `base` is the machine before a change (MachineJSON or `#id`): the chart marks added transitions and states green, removed ones red and dashed.
- `colors` gives states a CSS colour by key or id: `colors='{"payment":"purple"}'`. `caption` adds a line under the chart. A state's `description` shows under its name.
- Theme from page CSS with `--autoviz-*` properties, such as `auto-visualizer { --autoviz-active: #e11d48 }`; scope dark values to `prefers-color-scheme: dark`.
- Leave `height` unset and the element sizes itself to the chart, from 240px to 720px plus the walkthrough bar. Set `height` in your CSS to fix it.
- `theme` is `auto` (the reader's system setting), `light` or `dark`.
- Final states draw green. Tag a final state `error` or `failure` to draw it red.
- Charts load as they near the viewport. A page with ten charts loads the ones readers scroll to.
- Styles stay inside a shadow root, so the page and the chart keep their own CSS.
- `embed.d.ts` and `embed.react.d.ts` sit next to `embed.js` and type the element for TypeScript and JSX.

## Check your work

Open the page and confirm the chart draws. An event the machine doesn't accept, or a `machine` id the code doesn't create, shows its message inside the chart. Fix the attribute it names.

For a README or pull request, where scripts can't run, link an SVG image and put the chart's source in a `statechart` fence inside a collapsed `<details>` block below it. The Autovisualizer action with `render: README.md` draws the image and commits it; see the README's "In READMEs, issues and pull requests" section. To export by hand, use **Save → SVG image** or **Save → Animated SVG** in the app. A docs build can call `await element.toAnimatedSvg({ title })` on a loaded chart from a headless browser to get its walkthrough as an animated SVG.
