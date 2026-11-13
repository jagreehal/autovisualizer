import { describe, expect, it } from "vitest"

import { pillHome, wrap } from "./geometry"

// m ⊃ { a, p ⊃ { x, y } }
const parents = new Map([
  ["m.a", "m"],
  ["m.p", "m"],
  ["m.p.x", "m.p"],
  ["m.p.y", "m.p"]
])

describe("pillHome", () => {
  it("puts a pill between siblings in their parent", () => {
    expect(pillHome({ source: "m.p.x", target: "m.p.y" }, parents)).toBe("m.p")
  })

  it("puts a pill between cousins in the innermost state holding both", () => {
    expect(pillHome({ source: "m.p.x", target: "m.a" }, parents)).toBe("m")
  })

  it("puts a pill inside a state that holds the other end", () => {
    expect(pillHome({ source: "m.p", target: "m.p.y" }, parents)).toBe("m.p")
    expect(pillHome({ source: "m.p.y", target: "m.p" }, parents)).toBe("m.p")
  })

  it("puts a self-transition's pill beside its state, not inside it", () => {
    expect(pillHome({ source: "m.p", target: "m.p" }, parents)).toBe("m")
    expect(pillHome({ source: "m", target: "m" }, parents)).toBeUndefined()
  })
})

describe("wrap", () => {
  const measure = (line: string) => line.length * 10

  it("fills each line up to the width", () => {
    expect(wrap("waits for the bank to answer", 140, measure)).toEqual(["waits for the", "bank to answer"])
  })

  it("gives a word too long for any line a line of its own", () => {
    expect(wrap("a supercalifragilistic b", 60, measure)).toEqual(["a", "supercalifragilistic", "b"])
  })

  it("has no lines for no text", () => {
    expect(wrap("  ", 60, measure)).toEqual([])
  })
})
