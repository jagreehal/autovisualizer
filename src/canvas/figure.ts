/**
 * Opt-in flowchart shapes and colours from state tags, with Mermaid's names so they read at a glance:
 * `tags: ["shape:diamond", "color:#6b71a8"]`. States without these tags keep the rounded box.
 */
import type { Size } from "./geometry"

export const FIGURES = [
  "rect",
  "rounded",
  "stadium",
  "subroutine",
  "cylinder",
  "circle",
  "diamond",
  "hexagon",
  "parallelogram",
  "trapezoid"
] as const
export type Figure = (typeof FIGURES)[number]

const isFigure = (name: string): name is Figure => FIGURES.some((figure) => figure === name)

/** The first `shape:<name>` tag naming a known figure. */
export function figureOf(tags: ReadonlyArray<string>): Figure | undefined {
  for (const tag of tags) {
    const name = tag.startsWith("shape:") ? tag.slice(6) : ""
    if (isFigure(name)) return name
  }
  return undefined
}

/** The first `color:<css>` tag; only hex and named colours, since the value lands in markup. */
export function tagColor(tags: ReadonlyArray<string>): string | undefined {
  for (const tag of tags) {
    const value = tag.startsWith("color:") ? tag.slice(6) : ""
    if (/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value)) return value
  }
  return undefined
}

/**
 * The box a figure needs so a content box centred in it stays inside the outline.
 * Each case solves its outline for the content's corners; boxes need nothing extra.
 */
export function figureSize(figure: Figure | undefined, width: number, height: number): Size {
  switch (figure) {
    case "diamond":
      // A corner (w/2, h/2) is inside when w/W + h/H <= 1: doubling both is the smallest area.
      return { width: width * 2, height: height * 2 }
    case "circle": {
      // A circle, never an oval: the corners sit on it.
      const diameter = Math.hypot(width, height)
      return { width: diameter, height: diameter }
    }
    case "hexagon":
      // The top and bottom edges are 60% of the width.
      return { width: width / 0.6, height }
    case "parallelogram":
    case "trapezoid":
      // The slants take 15% from each side at the top or bottom, leaving 70% straight above or below.
      return { width: width / 0.7, height }
    case "cylinder":
      // Rims of 10px radius: the top one's front dips 20px in, so 20px both ends keeps content centred.
      return { width, height: height + 40 }
    default:
      return { width, height }
  }
}

/** The outline of `figure` in the box (x, y, w, h), as an SVG path. */
export function outlinePath(figure: Figure, x: number, y: number, w: number, h: number): string {
  const r = (v: number) => Math.round(v * 10) / 10
  const poly = (...points: ReadonlyArray<readonly [number, number]>) =>
    points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${r(x + px * w)} ${r(y + py * h)}`).join(" ") + " Z"
  const box = (radius: number) => {
    const k = Math.min(radius, w / 2, h / 2)
    const arc = (ex: number, ey: number) => `A${r(k)} ${r(k)} 0 0 1 ${r(ex)} ${r(ey)}`
    return [
      `M${r(x + k)} ${r(y)} H${r(x + w - k)}`,
      arc(x + w, y + k),
      `V${r(y + h - k)}`,
      arc(x + w - k, y + h),
      `H${r(x + k)}`,
      arc(x, y + h - k),
      `V${r(y + k)}`,
      arc(x + k, y),
      "Z"
    ].join(" ")
  }
  switch (figure) {
    case "rect":
      return box(2)
    case "rounded":
      return box(14)
    case "stadium":
      return box(h / 2)
    case "subroutine":
      // The predefined-process bars: open subpaths only add strokes, not fill.
      return `${box(2)} M${r(x + 8)} ${r(y)} V${r(y + h)} M${r(x + w - 8)} ${r(y)} V${r(y + h)}`
    case "cylinder": {
      const ry = Math.min(10, h / 4)
      const rim = (to: number, sweep: number) => `A${r(w / 2)} ${r(ry)} 0 0 ${sweep} ${r(to)} ${r(y + ry)}`
      return (
        `M${r(x)} ${r(y + ry)} ${rim(x + w, 1)} V${r(y + h - ry)} ` +
        `A${r(w / 2)} ${r(ry)} 0 0 1 ${r(x)} ${r(y + h - ry)} Z M${r(x)} ${r(y + ry)} ${rim(x + w, 0)}`
      )
    }
    case "circle":
      return `M${r(x)} ${r(y + h / 2)} A${r(w / 2)} ${r(h / 2)} 0 1 1 ${r(x + w)} ${r(y + h / 2)} A${r(w / 2)} ${r(h / 2)} 0 1 1 ${r(x)} ${r(y + h / 2)} Z`
    case "diamond":
      return poly([0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5])
    case "hexagon":
      return poly([0.2, 0], [0.8, 0], [1, 0.5], [0.8, 1], [0.2, 1], [0, 0.5])
    case "parallelogram":
      return poly([0.15, 0], [1, 0], [0.85, 1], [0, 1])
    case "trapezoid":
      return poly([0.15, 0], [0.85, 0], [1, 1], [0, 1])
  }
}
