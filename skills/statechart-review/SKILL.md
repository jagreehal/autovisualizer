---
name: statechart-review
description: Add the Autovisualizer statechart review to a repository's pull requests, or run it locally. Use when someone wants PRs to show how their XState machines changed (states and transitions added or removed, unreachable states, changed initial states) with a diagram per changed machine, or wants to gate merges on those changes.
---

# Review statechart changes in pull requests

The action runs each changed machine file at the PR's base and head, compares the machines, and posts one comment that it updates on each push. The comment holds:

- a merge risk: high when a machine loses a state or transition or a state becomes unreachable, moderate when a state changes kind or initial state, a target can't be read, or a file can't run
- a table of changed machines with states and transitions before and after
- a Mermaid statechart per changed machine, with added states in green and unreachable states in amber, plus a `diff` of the changes

It reads TypeScript and JavaScript that build machines (`createMachine`, `setup().createMachine`, `setupEffect().createMachine`, `machineFromJSON`) and MachineJSON files.

## Add it to a repository

Create `.github/workflows/statechart-review.yml`:

```yaml
name: Statechart review
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - uses: jagreehal/autovisualizer@main
        with:
          path: src/machines
```

Inputs worth setting:

| Input | Use |
| --- | --- |
| `path` | Pathspecs to review, space separated. Empty reviews the whole change. |
| `fail-on-regression` | `true` fails the job when the merge risk is high. |
| `app-url` | `https://autovisualizer.vercel.app` adds an "Open in Autovisualizer" link per machine. |
| `diagrams` | `collapsed` folds the diagrams in the comment. |

Use the `pull_request` trigger. The action runs the PR's code, the same as its tests, and refuses `pull_request_target`.

## Run it locally

From an Autovisualizer checkout:

```bash
pnpm build:review
cd /path/to/your/repo
node /path/to/autovisualizer/dist/review/cli.mjs --base origin/main
```

Add pathspecs to narrow it, `--head <ref>` to compare two commits, or `--format json` for the report, risk and markdown together.

## Read the result

- **Removed states and transitions:** confirm each removal was meant.
- **Unreachable states:** add a transition into the state or delete it.
- **Changed states:** check the new kind or initial state matches the intent.
- **Unreadable targets:** a transition function computes its target. Return a literal `target: "state"` so the diagram can draw the edge.
- **Evaluated:** the file threw while loading. The message names the error.
