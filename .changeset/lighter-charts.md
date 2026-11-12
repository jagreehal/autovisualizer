---
"autovisualizer": minor
---

The action draws statecharts for your READMEs. Link an SVG, put the chart's source in a `statechart` fence inside a collapsed `<details>` block below it, and set `render: README.md`: the action draws each image with the app's export, animates charts that have a walkthrough, and commits the SVGs that changed.

The review compares a pull request with the commit it branched from, so changes on the base branch since then stay out of it.

Charts take a lighter look. States carry a soft shadow and a thin border, lines draw at 1.5px, and the event you can send next fills solid blue. A click or a step updates the chart at once. When two short transitions run in opposite directions between the same states, such as `ADD_ITEM` and `EMPTY` between `idle` and `cart`, their labels sit side by side.
