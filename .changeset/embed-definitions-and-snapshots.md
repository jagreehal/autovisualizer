---
"autovisualizer": minor
---

`<auto-visualizer>` adds:

- `definition`: draw and step XState MachineJSON on the page with no Web Worker. Put it inline, or share one across charts with `definition="#id"`.
- `snapshot`: resume a persisted actor snapshot where it left off.
- A height that fits the chart when the page sets none.
- `direction="auto"` keeps the layout that shows the chart larger.
- Deep links to a walkthrough step work from the same page.
- `element.toAnimatedSvg()` returns the walkthrough as an animated SVG.
- A message naming the cause when a chart's worker can't start.
- Tooltips pass clicks through to the buttons beside them.
