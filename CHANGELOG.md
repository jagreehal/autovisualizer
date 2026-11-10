# autovisualizer

## 0.2.0

### Minor Changes

- 8221728: Final states tagged `error` or `failure` now draw in red, in the editor, embeds and SVG exports. Other final states stay green.

## 0.1.0

### Minor Changes

- 00a9a1c: Add `<auto-visualizer>`, a web component that puts an interactive statechart in any page. Load it from a CDN with one script tag, then give it a machine inline, by URL, or from a ```statechart Markdown fence. Walkthroughs with notes, autoplay and deep links step readers through a machine.
  
  Add a GitHub Action that comments on pull requests that change XState machines, with a merge risk, the states and transitions added or removed, and a statechart per machine.
  
  Export a chart as an SVG image or an animated SVG.
