/**
 * Runs in embed.js itself, before any chart loads (the chart loads lazily, on scroll):
 * sizes the tag so the page doesn't jump, hands each chart the source written inside it,
 * and, on pages that opt in, turns `statechart` code blocks from Markdown into charts.
 */
const TAG = "auto-visualizer"

// `:where` keeps the default at zero specificity, so any page rule wins:
// `auto-visualizer { height: 600px }`. Without one, the chart sets --autoviz-fit to its own height.
const style = document.createElement("style")
style.textContent = `:where(${TAG}){display:block;height:var(--autoviz-fit,480px)}`
document.head.append(style)

/**
 * Source inside the tag: `<script type="text/typescript">` is raw text, so `<` and `>` in
 * TypeScript survive, and the browser neither runs nor shows it. A `code` attribute wins.
 */
const INLINE = `${TAG}:not([code]) > script[type="text/typescript"]`

/**
 * A MachineJSON definition inside the tag, `<script type="application/json">`, or shared by several charts on the
 * page: `definition="#checkout"` names the element (usually such a script) that holds it.
 */
const INLINE_DEFINITION = `${TAG}:not([definition]) > script[type="application/json"]`
const SHARED_DEFINITION = `${TAG}[definition^="#"]`
/** `base="#checkout-before"`: the version a chart diffs against, shared the same way. */
const SHARED_BASE = `${TAG}[base^="#"]`

/** What Markdown renderers emit for a ```statechart fence: markdown-it, marked, Shiki, Expressive Code. */
const FENCES = ["pre > code.language-statechart", "pre.language-statechart", "pre[data-language='statechart']"].join(
  ","
)

/**
 * Fences run their code, so a page opts in with `<meta name="auto-visualizer-fences" content="on">`.
 * Sites where visitors write Markdown leave it off, and visitors' fences stay code.
 */
// Read once, from <head> only: markup added later, or in the body, can't turn fences on.
const fencesOn = document.head.querySelector('meta[name="auto-visualizer-fences"][content="on"]') !== null

function upgrade() {
  for (const script of document.querySelectorAll(INLINE)) {
    script.parentElement?.setAttribute("code", script.textContent ?? "")
  }
  for (const script of document.querySelectorAll(INLINE_DEFINITION)) {
    script.parentElement?.setAttribute("definition", script.textContent ?? "")
  }
  for (const [selector, attribute] of [
    [SHARED_DEFINITION, "definition"],
    [SHARED_BASE, "base"]
  ] as const) {
    for (const chart of document.querySelectorAll(selector)) {
      const ref = chart.getAttribute(attribute) ?? ""
      const source = document.getElementById(ref.slice(1))
      // Left as it is when missing: the chart reports the attribute isn't JSON, naming what it was given.
      if (source !== null) chart.setAttribute(attribute, source.textContent ?? "")
    }
  }
  if (!fencesOn) return
  for (const match of document.querySelectorAll(FENCES)) {
    const pre = match.closest("pre")
    if (pre === null) continue
    const chart = document.createElement(TAG)
    chart.setAttribute("code", pre.textContent ?? "")
    pre.replaceWith(chart)
  }
}

upgrade()
// Single-page apps render pages after load: upgrade whatever they add, once per batch.
let queued = false
new MutationObserver(() => {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    upgrade()
  })
}).observe(document.documentElement, { childList: true, subtree: true })
