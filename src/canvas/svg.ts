/**
 * The chart as one self-contained SVG, for places that can't run JavaScript: a README, a pull
 * request, an issue. Several frames make it an animation that steps through them with CSS alone.
 * Pure and deterministic: the same chart and frames always give the same bytes.
 */
import { finalTone } from "./final-tone"
import { SIZE } from "./geometry"

import type { Laidout, Point } from "./layout"

export interface Frame {
  /** Ids of the active states, as the simulation reports them. */
  readonly active: ReadonlyArray<string>
  /** What happened to get here, shown as the caption: "start", or the event sent. */
  readonly caption: string
}

export interface SvgOptions {
  /** The title a screen reader announces. */
  readonly title: string
  /** How long each frame shows. */
  readonly stepMs?: number
}

// The canvas palette from styles.css; the SVG carries both and follows the reader's scheme.
const LIGHT = {
  canvas: "#eff1f3",
  node: "#dfe3e7",
  fg: "#15151d",
  stroke: "#72758b",
  parent: "#eff1f3",
  parentBorder: "#c9ced6",
  parentHeader: "#f7f8f9",
  header: "#dfe3e7",
  pill: "#f4f5f7",
  casing: "#fdfdfe",
  active: "#005cde",
  finalFill: "#c9edbc",
  finalBorder: "#54b559",
  finalFg: "#0c2612",
  errorFinalFill: "#fadcd9",
  errorFinalBorder: "#d94c3d",
  errorFinalFg: "#3b0a06",
  warnFill: "#fde283",
  warnBorder: "#da931e",
  warnFg: "#2e1e00"
}
const DARK: typeof LIGHT = {
  canvas: "#15151d",
  node: "#2e2f3c",
  fg: "#f5f7f7",
  stroke: "#72758b",
  parent: "#18181f",
  parentBorder: "#34353f",
  parentHeader: "#23242e",
  header: "#2e2f3c",
  pill: "#1f2029",
  casing: "#15151d",
  active: "#63a3fc",
  finalFill: "#14371c",
  finalBorder: "#2f7a3d",
  finalFg: "#c9edbc",
  errorFinalFill: "#3a1410",
  errorFinalBorder: "#c24a3c",
  errorFinalFg: "#fadcd9",
  warnFill: "#432b00",
  warnBorder: "#8a5a00",
  warnFg: "#fde283"
}

const FONT = `Geist, "Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
const MARGIN = 24
/** Stands in for the scope id until the content it's hashed from is complete. */
const SCOPE = "\u0000scope"
const CAPTION = 44

const n = (value: number) => String(Math.round(value * 10) / 10)
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const vars = (palette: typeof LIGHT) =>
  Object.entries(palette)
    .map(([key, value]) => `--${key}:${value}`)
    .join(";")
/** Keyframe stops are rounded, so the same chart always writes the same bytes. */
const pct = (fraction: number) => `${Math.round(fraction * 10000) / 100}%`

/** FNV-1a: a scope id from the content, so two charts inlined in one page don't share styles. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

function path(points: ReadonlyArray<Point>): string {
  return points.map((point, i) => `${i === 0 ? "M" : "L"}${n(point.x)} ${n(point.y)}`).join(" ")
}

/** Step-end keyframes holding `values[i]` through frame i. */
function keyframes(name: string, property: string, values: ReadonlyArray<string>): string {
  const stops = values.map((value, i) => `${pct(i / values.length)}{${property}:${value}}`).join("")
  return `@keyframes ${name}{${stops}100%{${property}:${values.at(-1) ?? ""}}}`
}

export function toSvg(laidout: Laidout, frames: ReadonlyArray<Frame>, options: SvgOptions): string {
  const animated = frames.length > 1
  const stepMs = options.stepMs ?? 1400

  // React Flow positions children relative to their parent; the SVG needs them absolute.
  const origin = new Map<string, Point>()
  for (const node of laidout.nodes) {
    const parent = node.parentId === undefined ? { x: 0, y: 0 } : (origin.get(node.parentId) ?? { x: 0, y: 0 })
    origin.set(node.id, { x: parent.x + node.position.x, y: parent.y + node.position.y })
  }
  const width = Math.max(...laidout.nodes.map((node) => (origin.get(node.id)?.x ?? 0) + (node.width ?? 0))) + MARGIN * 2
  const chartHeight = Math.max(...laidout.nodes.map((node) => (origin.get(node.id)?.y ?? 0) + (node.height ?? 0)))
  const height = chartHeight + MARGIN * 2 + (animated ? CAPTION : 0)

  // Layered as the canvas is: containers, then lines, then states, then pills, so no line or
  // casing ever crosses a state's ring or a pill's text.
  const parents: Array<string> = []
  const lines: Array<string> = []
  const states: Array<string> = []
  const pills: Array<string> = []
  const captions: Array<string> = []
  const css: Array<string> = []
  const motion: Array<string> = []
  const text = (x: number, y: number, size: number, fill: string, value: string, anchor = "start") =>
    `<text x="${n(x)}" y="${n(y)}"${anchor === "start" ? "" : ` text-anchor="${anchor}"`} dominant-baseline="central" font-size="${size}" font-weight="600" fill="${fill}">${escape(value)}</text>`

  for (const node of laidout.nodes) {
    const { state, machineId, isRoot, isRegion, isUnreachable } = node.data
    const at = origin.get(node.id) ?? { x: 0, y: 0 }
    const w = node.width ?? 0
    const h = node.height ?? 0
    const box = `x="${n(at.x)}" y="${n(at.y)}" width="${n(w)}" height="${n(h)}"`
    if (state.children.length > 0) {
      const header = SIZE.headerHeight
      if (isRoot) {
        parents.push(
          `<rect x="${n(at.x)}" y="${n(at.y)}" width="${n(w)}" height="${header}" rx="6" fill="var(--header)"/>`
        )
      } else {
        const dash = isRegion ? ` stroke-dasharray="6 5"` : ""
        parents.push(
          `<rect ${box} rx="8" fill="var(--parent)" stroke="var(--parentBorder)" stroke-width="${isRegion ? 2 : 3}"${dash}/>`,
          `<path d="M${n(at.x)} ${n(at.y + header)}H${n(at.x + w)}" stroke="var(--parentBorder)" stroke-width="2"/>`
        )
      }
      parents.push(text(at.x + 16, at.y + header / 2, 16, "var(--fg)", state.key || machineId))
      continue
    }
    const tone = isUnreachable ? "warn" : state.kind === "final" ? finalTone(state.tags) : undefined
    const fill = tone ? `var(--${tone}Fill)` : "var(--node)"
    const stroke = tone ? `var(--${tone}Border)` : "var(--stroke)"
    const color = tone ? `var(--${tone}Fg)` : "var(--fg)"
    states.push(`<rect ${box} rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`)
    // The name sits in the top row when invoke chips fill the rows below it.
    const nameY = state.invokes.length > 0 ? at.y + SIZE.leafHeight / 2 : at.y + h / 2
    if (state.kind === "final") {
      // The final-state mark: a ring with a dot, before the name.
      const cx = at.x + SIZE.leafPadX + SIZE.finalIcon / 2
      states.push(
        `<circle cx="${n(cx)}" cy="${n(nameY)}" r="7.5" fill="none" stroke="${color}" stroke-width="2.5"/>`,
        `<circle cx="${n(cx)}" cy="${n(nameY)}" r="2.5" fill="${color}"/>`,
        text(cx + SIZE.finalIcon / 2 + 8, nameY, 20, color, state.key)
      )
    } else if (state.invokes.length > 0) {
      states.push(text(at.x + SIZE.leafPadX, nameY, 20, color, state.key))
    } else {
      states.push(text(at.x + w / 2, nameY, 20, color, state.key, "middle"))
    }
    state.invokes.forEach((src, i) => {
      const top = at.y + SIZE.leafHeight - 6 + i * (SIZE.chipHeight + SIZE.chipGap)
      states.push(
        `<rect x="${n(at.x + SIZE.leafPadX)}" y="${n(top)}" width="${n(w - SIZE.leafPadX * 2)}" height="${SIZE.chipHeight}" rx="5" fill="var(--canvas)" stroke="var(--stroke)" stroke-opacity="0.4"/>`,
        `<text x="${n(at.x + SIZE.leafPadX + 8)}" y="${n(top + SIZE.chipHeight / 2)}" dominant-baseline="central" font-family="ui-monospace, monospace" font-size="12" fill="var(--fg)" fill-opacity="0.85">invoke ${escape(src)}</text>`
      )
    })
    // The active mark, a 4px blue ring 2px off the state, shown in the frames it's active.
    const shown = frames.map((frame) => (frame.active.includes(state.id) ? "1" : "0"))
    if (!shown.includes("1")) continue
    const ring = `r${css.length}`
    states.push(
      `<rect class="${ring}" x="${n(at.x - 4)}" y="${n(at.y - 4)}" width="${n(w + 8)}" height="${n(h + 8)}" rx="9" fill="none" stroke="var(--active)" stroke-width="4"/>`
    )
    css.push(`.${ring}{opacity:${shown.at(-1)}}`)
    if (animated)
      motion.push(
        keyframes(`${SCOPE}-${ring}`, "opacity", shown),
        `.${ring}{animation:${SCOPE}-${ring} var(--cycle) step-end infinite}`
      )
  }

  for (const flow of laidout.edges) {
    if (flow.data === undefined) continue
    const { edge, points, label } = flow.data
    const d = path(points)
    const dash = edge.inferred ? ` stroke-dasharray="6 5"` : ""
    lines.push(
      `<path d="${d}" fill="none" stroke="var(--casing)" stroke-width="6" stroke-linejoin="round"/>`,
      `<path d="${d}" fill="none" stroke="var(--stroke)" stroke-width="2"${dash} marker-end="url(#${SCOPE}-arrow)"/>`
    )
    pills.push(
      `<rect x="${n(label.x)}" y="${n(label.y)}" width="${n(label.width)}" height="${n(label.height)}" rx="${n(label.height / 2)}" fill="var(--pill)" stroke="var(--stroke)" stroke-width="2"${dash}/>`,
      text(label.x + label.width / 2, label.y + label.height / 2, 14, "var(--fg)", edge.label, "middle")
    )
  }

  if (animated) {
    frames.forEach((frame, i) => {
      const caption = `c${i}`
      const visible = frames.map((_, j) => (j === i ? "1" : "0"))
      captions.push(
        `<text class="${caption}" x="0" y="${n(chartHeight + MARGIN / 2 + CAPTION / 2)}" dominant-baseline="central" font-size="15" font-weight="600" fill="var(--fg)">Step ${i + 1} of ${frames.length}: ${escape(frame.caption)}</text>`
      )
      css.push(`.${caption}{opacity:${visible.at(-1)}}`)
      motion.push(
        keyframes(`${SCOPE}-${caption}`, "opacity", visible),
        `.${caption}{animation:${SCOPE}-${caption} var(--cycle) step-end infinite}`
      )
    })
  }

  const body = [...parents, ...lines, ...states, ...pills, ...captions].join("")
  // Everything the chart draws and animates: two traces that differ only in timing or in
  // which state is active when must not share keyframes on one page.
  const scope = `autoviz-${hash([body, ...css, ...motion, options.title, stepMs].join("\n"))}`
  const content = body.replaceAll(SCOPE, scope)
  const style = [
    `#${scope}{${vars(LIGHT)};--cycle:${stepMs * frames.length}ms;font-family:${FONT}}`,
    `@media (prefers-color-scheme:dark){#${scope}{${vars(DARK)}}}`,
    ...css.map((rule) => `#${scope} ${rule}`),
    // Readers who ask for less motion get the last frame, still.
    ...(motion.length > 0
      ? [
          `@media (prefers-reduced-motion:no-preference){${motion.map((rule) => (rule.startsWith("@") ? rule : `#${scope} ${rule}`)).join("")}}`
        ]
      : [])
  ]
    .join("")
    // Keyframe names are global to the page, unlike selectors under #scope: scope them too.
    .replaceAll(SCOPE, scope)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" id="${scope}" viewBox="${-MARGIN} ${-MARGIN} ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" role="img" aria-labelledby="${scope}-title">`,
    `<title id="${scope}-title">${escape(options.title)}</title>`,
    `<style>${style}</style>`,
    `<defs><marker id="${scope}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0.5L10 5L0 9.5z" fill="var(--stroke)"/></marker></defs>`,
    `<rect x="${-MARGIN}" y="${-MARGIN}" width="${n(width)}" height="${n(height)}" fill="var(--canvas)"/>`,
    content,
    `</svg>`,
    ""
  ].join("\n")
}
