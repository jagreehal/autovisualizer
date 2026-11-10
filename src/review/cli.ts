/**
 * `review`: the statechart review of a change, for a PR comment or a job summary.
 *
 *   node dist/review/cli.mjs [pathspec...] --base origin/main [--head HEAD]
 *     [--format markdown|json] [-o file] [--diagrams open|collapsed] [--app-url URL]
 *     [--fail-on-regression]
 *
 * JSON carries the markdown too, so the action needs one run for the gate and the comment.
 */
import { writeFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { buildReview, renderReviewMarkdown } from "./review"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "HEAD" },
    head: { type: "string" },
    format: { type: "string", short: "f", default: "markdown" },
    output: { type: "string", short: "o" },
    diagrams: { type: "string", default: "open" },
    "app-url": { type: "string" },
    "fail-on-regression": { type: "boolean", default: false }
  }
})
// A leading `review` is the command name, not a path.
const paths = positionals[0] === "review" ? positionals.slice(1) : positionals

if (values.format !== "markdown" && values.format !== "json") throw new Error("--format is markdown or json")
if (values.diagrams !== "open" && values.diagrams !== "collapsed") throw new Error("--diagrams is open or collapsed")

// Reviewed code may log at top level; keep stdout for the report.
const print = console.log
console.log = console.error

const report = await buildReview({ base: values.base, head: values.head, paths })
const markdown = renderReviewMarkdown(report, { diagrams: values.diagrams, appUrl: values["app-url"] })
const rendered = values.format === "json" ? JSON.stringify({ ...report, markdown }, null, 2) : markdown

if (values.output) writeFileSync(values.output, rendered)
else print(rendered)

if (values["fail-on-regression"] && report.risk === "high") {
  console.error("Merge risk is high: a machine lost states or transitions. See the review.")
  process.exitCode = 1
}
