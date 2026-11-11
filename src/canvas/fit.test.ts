import { describe, expect, it } from "vitest"

import { fitScale, roomier } from "./geometry"

const inset = { x: 32, top: 32, bottom: 84 }

describe("roomier", () => {
  // A six-step chain, each step with an error exit.
  const right = { width: 2600, height: 420 }
  const down = { width: 760, height: 1250 }

  it("lays a long chain out top to bottom in a wide column that can grow tall", () => {
    expect(roomier(right, down, { width: 1100, height: 720 }, inset, 1.5)).toBe("DOWN")
  })

  it("keeps it left to right in a short, wide box", () => {
    expect(roomier(right, down, { width: 1600, height: 360 }, inset, 1.5)).toBe("RIGHT")
  })

  it("prefers right when both fit at the zoom cap, as a small machine does", () => {
    const small = { width: 300, height: 120 }
    expect(fitScale(small, { width: 1100, height: 720 }, inset, 1.5)).toBe(1.5)
    expect(roomier(small, { width: 140, height: 260 }, { width: 1100, height: 720 }, inset, 1.5)).toBe("RIGHT")
  })
})
