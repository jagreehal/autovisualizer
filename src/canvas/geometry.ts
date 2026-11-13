import type { Direction } from "./layout"

/**
 * Sizes shared by the layout, the canvas and the SVG export: 20px state names and 14px
 * events, both readable at fit-to-screen zoom.
 */
export const SIZE = {
  leafHeight: 46,
  leafPadX: 20,
  headerHeight: 46,
  chipHeight: 24,
  chipGap: 6,
  pillHeight: 34,
  pillPadX: 14,
  diamond: 18,
  kindIcon: 14,
  finalIcon: 20,
  countPadX: 7,
  regionPad: 28,
  /** A state's description wraps at this width, in lines this tall. */
  descriptionWidth: 220,
  descriptionLine: 18
} as const

export const FONT = {
  state: "600 20px 'Geist Variable'",
  parent: "600 16px 'Geist Variable'",
  pill: "600 14px 'Geist Variable'",
  chip: "500 12px 'Geist Mono Variable'",
  description: "400 13px 'Geist Variable'",
  count: "600 12px 'Geist Mono Variable'"
} as const

export interface Size {
  readonly width: number
  readonly height: number
}

/** Space kept clear around a fitted chart: the floating chrome. */
export interface Inset {
  readonly x: number
  readonly top: number
  readonly bottom: number
}

/** The zoom that fits a `chart`-sized layout in `area` inside `inset`, capped at `max`. */
export const fitScale = (chart: Size, area: Size, inset: Inset, max: number) =>
  Math.min(max, (area.width - 2 * inset.x) / chart.width, (area.height - inset.top - inset.bottom) / chart.height)

/**
 * The direction that shows the chart larger in `area`: a long chain reads better top to bottom in a wide column, and
 * a wide machine left to right in a short one. Right on a tie, such as a small machine that fits either way.
 */
export const roomier = (right: Size, down: Size, area: Size, inset: Inset, max: number): Direction =>
  fitScale(down, area, inset, max) > fitScale(right, area, inset, max) ? "DOWN" : "RIGHT"

/** Ids of a state and its ancestors, the state first. */
export function ancestry(id: string, parents: ReadonlyMap<string, string>): Array<string> {
  const parent = parents.get(id)
  return parent === undefined ? [id] : [id, ...ancestry(parent, parents)]
}

/**
 * The state a transition's pill sits in: the innermost one holding both ends, or the end itself when it holds the
 * other. A self-transition's pill sits beside its state, in the state's parent.
 */
export function pillHome(
  edge: { readonly source: string; readonly target: string },
  parents: ReadonlyMap<string, string>
) {
  const from = edge.source === edge.target ? ancestry(edge.source, parents).slice(1) : ancestry(edge.source, parents)
  const to = new Set(ancestry(edge.target, parents))
  // The machine root holds everything, so only a self-transition on the root itself finds none.
  return from.find((id) => to.has(id))
}

/** `text` broken into lines no wider than `max`, as `measure` sizes them. A word longer than `max` gets a line of its own. */
export function wrap(text: string, max: number, measure: (line: string) => number): Array<string> {
  const lines: Array<string> = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1)
    if (last !== undefined && measure(`${last} ${word}`) <= max) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}
