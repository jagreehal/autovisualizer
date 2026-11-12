import { describe, expect, it } from "vitest"

import { onLine, placePills } from "./geometry"

const pill = { width: 80, height: 34 }

describe("onLine", () => {
  it("centres a pill ELK set below a horizontal line onto the line", () => {
    const at = onLine(
      [
        { x: 0, y: 100 },
        { x: 300, y: 100 }
      ],
      { x: 110, y: 100, ...pill }
    )
    expect(at).toEqual({ x: 110, y: 83 })
  })

  it("picks the nearest segment of a bent path", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 400 }
    ]
    const at = onLine(path, { x: 170, y: 180, ...pill })
    expect(at).toEqual({ x: 160, y: 180 })
  })

  it("keeps the pill on the segment, not past its end", () => {
    const at = onLine(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      ],
      { x: 200, y: 60, ...pill }
    )
    expect(at).toEqual({ x: 60, y: 33 })
  })
})

describe("placePills", () => {
  const line = [
    { x: 0, y: 100 },
    { x: 400, y: 100 }
  ]

  it("slides a pill along its line off another pill instead of stacking them", () => {
    const [first, second] = placePills(
      [
        { points: line, label: { x: 160, y: 100, ...pill } },
        {
          points: [
            { x: 0, y: 110 },
            { x: 400, y: 110 }
          ],
          label: { x: 160, y: 110, ...pill }
        }
      ],
      []
    )
    expect(first).toMatchObject({ x: 160, y: 83 })
    expect(second?.y).toBe(93)
    // Side by side on their lines, with a gap: neither covers the other's text.
    expect(Math.abs((second?.x ?? 0) - 160)).toBeGreaterThanOrEqual(pill.width + 4)
  })

  it("never puts a pill over a state", () => {
    const state = { x: 140, y: 80, width: 120, height: 46 }
    const [spot] = placePills([{ points: line, label: { x: 160, y: 100, ...pill } }], [state])
    const clear = (spot?.x ?? 0) + pill.width + 4 <= state.x || (spot?.x ?? 0) >= state.x + state.width + 4
    expect(clear).toBe(true)
  })

  it("keeps ELK's own spot when the line has no free room", () => {
    const short = [
      { x: 0, y: 100 },
      { x: 60, y: 100 }
    ]
    const wall = { x: -100, y: 60, width: 300, height: 80 }
    const label = { x: 10, y: 150, ...pill }
    expect(placePills([{ points: short, label }], [wall])).toEqual([label])
  })

  it("moves ELK's spot off a pill placed before it when the line has no free room", () => {
    // Two short opposite edges between stacked states (idle ⇄ cart): no room on either line.
    const idle = { x: 0, y: 0, width: 200, height: 46 }
    const cart = { x: 0, y: 120, width: 200, height: 46 }
    const down = [
      { x: 120, y: 46 },
      { x: 120, y: 120 }
    ]
    const up = [
      { x: 90, y: 120 },
      { x: 90, y: 46 }
    ]
    const [first, second] = placePills(
      [
        { points: down, label: { x: 120, y: 66, ...pill } },
        { points: up, label: { x: 30, y: 66, ...pill } }
      ],
      [idle, cart]
    )
    const apart =
      (first?.x ?? 0) + pill.width + 4 <= (second?.x ?? 0) || (second?.x ?? 0) + pill.width + 4 <= (first?.x ?? 0)
    expect(apart).toBe(true)
  })
})
