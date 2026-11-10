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
3. **Markdown.** Add `<meta name="auto-visualizer-fences" content="on">` to the page's `<head>`, and a fenced block tagged `statechart` becomes a chart. This covers markdown-it, marked, Shiki and Expressive Code (Starlight), including pages a single-page app renders later. Fences run their code with the page's origin: leave the tag off pages where visitors write Markdown, such as comments or wikis.

The code may import `xstate`, `@xstate/effect` and `effect`. When it creates several machines, pick one with `machine="id"`.

## Tell a story

- `events="ADD_ITEM CHECKOUT"` sends events before the chart shows, so it opens partway through.
- `walkthrough='[{"event":"SUBMIT","note":"take payment"}]'` adds previous, play and next controls with a note per step.
- `autoplay` steps through the walkthrough by itself. Readers who prefer reduced motion step by hand.
- Give the element an `id` and each step lands in the URL (`#checkout/2`). Share that link to open the walkthrough at that step.

## Fit it to the page

- The chart has no title bar or breadcrumb. Name the machine in the page's prose or heading.
- Readers scroll past a chart with the wheel or one finger. Mouse drag, or two fingers on a touch screen, pans and zooms it. Below about 520px wide the chart lays out top to bottom.
- The element is 480px tall. Set `height` in your CSS to change it.
- `theme` is `auto` (the reader's system setting), `light` or `dark`.
- Charts load as they near the viewport. A page with ten charts loads the ones readers scroll to.
- Styles stay inside a shadow root, so the page and the chart keep their own CSS.
- `embed.d.ts` and `embed.react.d.ts` sit next to `embed.js` and type the element for TypeScript and JSX.

## Check your work

Open the page and confirm the chart draws. An event the machine doesn't accept, or a `machine` id the code doesn't create, shows its message inside the chart. Fix the attribute it names.

For a README or pull request, where scripts can't run, export from the app instead: **Save → SVG image** or **Save → Animated SVG**.
