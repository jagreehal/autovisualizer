import { describe, expect, it } from "vitest"

import { FIGURES, figureOf, figureSize, outlinePath, tagColor } from "./figure"

describe("figureOf", () => {
  it("reads only namespaced, known shapes", () => {
    expect(figureOf([])).toBeUndefined()
    expect(figureOf(["step", "end", "condition", "error"])).toBeUndefined()
    expect(figureOf(["shape:blob"])).toBeUndefined()
    expect(figureOf(["error", "shape:diamond"])).toBe("diamond")
    expect(figureOf(["shape:circle", "shape:diamond"])).toBe("circle")
  })
})

describe("tagColor", () => {
  it("accepts hex and named colours, rejects anything that could escape markup", () => {
    expect(tagColor(["color:#6b71a8"])).toBe("#6b71a8")
    expect(tagColor(["color:purple"])).toBe("purple")
    expect(tagColor(["color:red;background:url(x)"])).toBeUndefined()
    expect(tagColor(['color:red"/><script>'])).toBeUndefined()
    expect(tagColor(["purple"])).toBeUndefined()
  })
})

describe("figureSize", () => {
  // A wide label with a description: the case where a fixed scale let text cross the outline.
  const [cw, ch] = [260, 110]
  // The content's top-right corner, relative to the box's centre; the others mirror it.
  const corner = (box: { width: number; height: number }) => ({
    x: cw / 2,
    y: ch / 2,
    halfW: box.width / 2,
    halfH: box.height / 2
  })

  it("leaves boxes and unshaped states at their content size", () => {
    for (const figure of [undefined, "rect", "rounded", "stadium", "subroutine"] as const)
      expect(figureSize(figure, cw, ch)).toEqual({ width: cw, height: ch })
  })

  it("draws circles round, with the content's corners inside", () => {
    const box = figureSize("circle", cw, ch)
    expect(box.width).toBe(box.height)
    const { x, y, halfW } = corner(box)
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(halfW + 1e-9)
  })

  it("keeps the content's corners inside a diamond", () => {
    const { x, y, halfW, halfH } = corner(figureSize("diamond", cw, ch))
    expect(x / halfW + y / halfH).toBeLessThanOrEqual(1 + 1e-9)
  })

  it("keeps the content inside the slanted sides", () => {
    // At the top and bottom edges, where the slants come in furthest.
    const hexagon = figureSize("hexagon", cw, ch)
    expect(hexagon.width * 0.6).toBeGreaterThanOrEqual(cw - 1e-9)
    for (const figure of ["trapezoid", "parallelogram"] as const)
      expect(figureSize(figure, cw, ch).width * 0.7).toBeGreaterThanOrEqual(cw - 1e-9)
  })

  it("keeps the content clear of a cylinder's rims", () => {
    const box = figureSize("cylinder", cw, ch)
    // The top rim's front dips 2 × 10px in; content centred starts below it.
    expect((box.height - ch) / 2).toBeGreaterThanOrEqual(20)
  })
})

describe("outlinePath", () => {
  it("draws polygons inside the box", () => {
    expect(outlinePath("diamond", 0, 0, 100, 40)).toBe("M50 0 L100 20 L50 40 L0 20 Z")
    expect(outlinePath("trapezoid", 0, 0, 100, 40)).toBe("M15 0 L85 0 L100 40 L0 40 Z")
  })

  it("draws every shape as a closed path with finite numbers", () => {
    for (const figure of FIGURES) {
      const d = outlinePath(figure, 10, 20, 120, 50)
      expect(d.startsWith("M")).toBe(true)
      expect(d).toContain("Z")
      expect(d).not.toMatch(/NaN|Infinity/)
    }
  })
})
