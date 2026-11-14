# autovisualizer

## 0.9.0

### Minor Changes

- 75b3a07: Draw states as flowchart shapes. Tag a state `shape:diamond`, `shape:cylinder` or any of ten Mermaid shape names, colour it with `color:#6b71a8`, or theme a whole shape with `--autoviz-shape-diamond`. Shapes size to their labels in the editor, embeds and SVG exports.

## 0.8.0

### Minor Changes

- 6f4a07e: Embed charts on pages with a strict Content Security Policy, such as sandboxed iframes and Claude artifacts. `embed.js` carries its stylesheet and Geist fonts, and the layout measures labels with the same font stack the page draws, so state names and events fit with or without Geist. A button in the top-right corner shows the chart full screen. If a layout throws, the chart shows the error.

## 0.7.0

### Minor Changes

- 452ffe4: Each event gets its own space in the layout, so busy charts stay readable. Show a change with `base`: added states and transitions in green, removed ones in red, newly unreachable states flagged. Tint states with `colors`, add a line under the chart with `caption`, and theme from page CSS with `--autoviz-*` properties. States show their `description` under their name.

## 0.6.0

### Minor Changes

- fe0b4f4: Walkthroughs can talk. `speak` reads each step's note with the browser's voice, `audio-src="audio/{step}.wav"` plays a recorded clip per step, and `element.narrate = async (step) => urlOrBlob` voices steps live from any speech model. Autoplay waits for each step's audio. `element.getSteps()` lists every step's text for recording clips ahead of time, and a `step` event fires on each step.

## 0.5.0

### Minor Changes

- d5fb2d6: The action draws statecharts for your READMEs. Link an SVG, put the chart's source in a `statechart` fence inside a collapsed `<details>` block below it, and set `render: README.md`: the action draws each image with the app's export, animates charts that have a walkthrough, and commits the SVGs that changed.
  
  The review compares a pull request with the commit it branched from, so changes on the base branch since then stay out of it.
  
  Charts take a lighter look. States carry a soft shadow and a thin border, lines draw at 1.5px, and the event you can send next fills solid blue. A click or a step updates the chart at once. When two short transitions run in opposite directions between the same states, such as `ADD_ITEM` and `EMPTY` between `idle` and `cart`, their labels sit side by side.

## 0.4.1

### Patch Changes

- 198ab2c: `element.toAnimatedSvg()` leaves room for the machine's name bar, so the bar no longer covers the first state in a top-to-bottom export.

## 0.4.0

### Minor Changes

- 6581d18: `<auto-visualizer>` adds:
  
  - `definition`: draw and step XState MachineJSON on the page with no Web Worker. Put it inline, or share one across charts with `definition="#id"`.
  - `snapshot`: resume a persisted actor snapshot where it left off.
  - A height that fits the chart when the page sets none.
  - `direction="auto"` keeps the layout that shows the chart larger.
  - Deep links to a walkthrough step work from the same page.
  - `element.toAnimatedSvg()` returns the walkthrough as an animated SVG.
  - A message naming the cause when a chart's worker can't start.
  - Tooltips pass clicks through to the buttons beside them.

## 0.3.0

### Minor Changes

- 1e994f7: `<auto-visualizer>` overlays real runs on a machine and opens in any state.
  
  - `counts` puts each transition's run count on its event and dashes transitions with a count of 0.
  - The chart highlights the path that `events` and a walkthrough take.
  - `state` opens the chart in a named state. `input` and `context` set the machine's data.
  - `events` and walkthrough steps send events that carry data.
  - `direction` lays the chart out `right` or `down`.

## 0.2.0

### Minor Changes

- 8221728: Final states tagged `error` or `failure` now draw in red, in the editor, embeds and SVG exports. Other final states stay green.

## 0.1.0

### Minor Changes

- 00a9a1c: Add `<auto-visualizer>`, a web component that puts an interactive statechart in any page. Load it from a CDN with one script tag, then give it a machine inline, by URL, or from a ```statechart Markdown fence. Walkthroughs with notes, autoplay and deep links step readers through a machine.
  
  Add a GitHub Action that comments on pull requests that change XState machines, with a merge risk, the states and transitions added or removed, and a statechart per machine.
  
  Export a chart as an SVG image or an animated SVG.
