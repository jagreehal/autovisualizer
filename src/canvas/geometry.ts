import type { Direction, Point } from "./layout"

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
  regionPad: 28
} as const

export const FONT = {
  state: "600 20px 'Geist Variable'",
  parent: "600 16px 'Geist Variable'",
  pill: "600 14px 'Geist Variable'",
  chip: "500 12px 'Geist Mono Variable'",
  count: "600 12px 'Geist Mono Variable'"
} as const

export interface Rect extends Point {
  readonly width: number
  readonly height: number
}

/** Pills keep this much clear space from states and from each other. */
const GAP = 4
/** Spacing of the positions tried along a line when the nearest one is taken. */
const STEP = 6

const centred = (point: Point, size: Rect): Rect => ({
  ...size,
  x: point.x - size.width / 2,
  y: point.y - size.height / 2
})

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP

/**
 * ELK sets an inline label beside its line. Move the pill's centre to the nearest point of
 * the edge's own path, so the pill sits on its line.
 */
export function onLine(points: ReadonlyArray<Point>, label: Rect): Point {
  const centre = { x: label.x + label.width / 2, y: label.y + label.height / 2 }
  let best = centre
  let bestDistance = Number.POSITIVE_INFINITY
  points.forEach((a, i) => {
    const b = points[i + 1]
    if (b === undefined) return
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = dx * dx + dy * dy
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / length))
    const point = { x: a.x + t * dx, y: a.y + t * dy }
    const distance = Math.hypot(point.x - centre.x, point.y - centre.y)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  })
  return { x: best.x - label.width / 2, y: best.y - label.height / 2 }
}

/** Every point along a path, STEP apart. */
function samples(points: ReadonlyArray<Point>): Array<Point> {
  return points.flatMap((a, i) => {
    const b = points[i + 1]
    if (b === undefined) return []
    const steps = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / STEP))
    return Array.from({ length: steps + 1 }, (_, s) => ({
      x: a.x + ((b.x - a.x) * s) / steps,
      y: a.y + ((b.y - a.y) * s) / steps
    }))
  })
}

/** How far, in STEPs, a pill may move off ELK's spot when its line has no room. */
const REACH = 20

/**
 * ELK's spot, or the free spot nearest it. ELK keeps its spot clear of states, but not of pills
 * already moved onto their lines (two short opposite edges between the same states).
 */
function nearestFree(label: Rect, free: (rect: Rect) => boolean): Rect {
  const offsets = Array.from({ length: REACH * 2 + 1 }, (_, i) => (i - REACH) * STEP)
  return (
    offsets
      .flatMap((dx) => offsets.map((dy) => ({ ...label, x: label.x + dx, y: label.y + dy })))
      .sort((a, b) => Math.hypot(a.x - label.x, a.y - label.y) - Math.hypot(b.x - label.x, b.y - label.y))
      .find(free) ?? label
  )
}

/**
 * Place every pill on its line, clear of states and of the pills placed before it, so no line
 * or pill ever covers text. Each pill takes the free spot on its own line nearest to where ELK
 * put it; with none free it takes the free spot nearest ELK's own.
 */
export function placePills(
  edges: ReadonlyArray<{ readonly points: ReadonlyArray<Point>; readonly label: Rect }>,
  obstacles: ReadonlyArray<Rect>
): Array<Rect> {
  const placed: Array<Rect> = []
  return edges.map(({ points, label }) => {
    const target = onLine(points, label)
    const free = (rect: Rect) => !obstacles.some((o) => overlaps(rect, o)) && !placed.some((p) => overlaps(rect, p))
    const candidates = samples(points)
      .map((point) => centred(point, label))
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
    const spot = [{ ...label, ...target }, ...candidates].find(free) ?? nearestFree(label, free)
    placed.push(spot)
    return spot
  })
}

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
