import { describe, expect, it } from "vitest"

import { findCharts } from "./render"

const chart = (image: string, fence: string, source: string) =>
  `![Door](${image})\n<details><summary>Statechart source</summary>\n\n${fence}\n${source}\n\`\`\`\n</details>\n`

describe("findCharts", () => {
  it("reads the image path, fence attributes and source of each chart", () => {
    const markdown = [
      "# Docs",
      chart(
        "docs/door.svg",
        '```statechart walkthrough=\'[{"event":"OPEN"}]\' direction="down"',
        "export const door = 1"
      ),
      "Some prose.",
      chart("json.svg", "```statechart", '{ "id": "door" }')
    ].join("\n")
    const [first, second] = findCharts(markdown)
    expect(first?.image).toBe("docs/door.svg")
    expect(first?.source).toBe("export const door = 1")
    expect(Object.fromEntries(first?.attributes ?? [])).toEqual({
      walkthrough: '[{"event":"OPEN"}]',
      direction: "down"
    })
    expect(second).toMatchObject({ image: "json.svg", source: '{ "id": "door" }' })
  })

  it("skips remote images, other fences, and a details block that closes before any fence", () => {
    const markdown = [
      chart("https://example.com/door.svg", "```statechart", "x"),
      chart("ts.svg", "```ts", "x"),
      "![Lone](lone.svg)\n<details>no fence</details>\n\n```statechart\nx\n```"
    ].join("\n")
    expect(findCharts(markdown)).toEqual([])
  })
})
