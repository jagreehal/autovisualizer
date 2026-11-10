import { describe, expect, it } from "vitest"

import { finalTone } from "./final-tone"

describe("finalTone", () => {
  it("keeps untagged and success finals green", () => {
    expect(finalTone([])).toBe("final")
    expect(finalTone(["success"])).toBe("final")
  })

  it("paints error and failure tags as the error final", () => {
    expect(finalTone(["error"])).toBe("errorFinal")
    expect(finalTone(["failure"])).toBe("errorFinal")
    expect(finalTone(["success", "error"])).toBe("errorFinal")
  })
})
