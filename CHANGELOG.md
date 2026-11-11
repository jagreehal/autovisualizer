# autovisualizer

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
