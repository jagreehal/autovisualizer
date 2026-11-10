import { describe, expect, it } from "vitest"
import { createMachine } from "xstate"

import { toMachineGraph } from "../machine/graph"

import { toSvg } from "./svg"

import type { Laidout, StateFlowNode, TransitionFlowEdge } from "./layout"

// A real machine's graph, laid out by hand: ELK needs a browser to measure text.
const graph = toMachineGraph(
  createMachine({
    id: "toggle",
    initial: "off",
    states: { off: { on: { TOGGLE: { target: "on" } } }, on: { on: { "A&B<C>": { target: "off" } } } }
  }),
  undefined
)

const state = (id: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
  const found = [graph.root, ...graph.root.children].find((node) => node.id === id)
  if (found === undefined) throw new Error(`no state ${id}`)
  const node: StateFlowNode = {
    id: `s:${id}`,
    type: "state",
    position,
    ...size,
    parentId: id === "toggle" ? undefined : "s:toggle",
    data: {
      state: found,
      machineId: "toggle",
      isRoot: id === "toggle",
      isInitial: id === "toggle.off",
      isRegion: false,
      isUnreachable: false,
      hasUnresolved: false
    }
  }
  return node
}

const edges = graph.edges.map((edge, i): TransitionFlowEdge => ({
  id: edge.id,
  type: "transition",
  source: `s:${edge.source}`,
  target: `s:${edge.target}`,
  data: {
    edge,
    points: [
      { x: 120, y: 90 + i * 60 },
      { x: 260, y: 90 + i * 60 }
    ],
    label: { x: 150, y: 73 + i * 60, width: 80, height: 34 }
  }
}))

const laidout: Laidout = {
  nodes: [
    state("toggle", { x: 0, y: 0 }, { width: 400, height: 220 }),
    state("toggle.off", { x: 28, y: 74 }, { width: 90, height: 46 }),
    state("toggle.on", { x: 280, y: 74 }, { width: 90, height: 46 })
  ],
  edges
}

const off = { active: ["toggle", "toggle.off"], caption: "start" }
const on = { active: ["toggle", "toggle.on"], caption: "TOGGLE" }

describe("toSvg", () => {
  it("is deterministic: the same chart and frames give the same bytes", () => {
    expect(toSvg(laidout, [off, on], { title: "Toggle" })).toBe(toSvg(laidout, [off, on], { title: "Toggle" }))
  })

  it("draws a still image for one frame, with the active state ringed", () => {
    const svg = toSvg(laidout, [off], { title: "Toggle" })
    expect(svg).not.toContain("@keyframes")
    expect(svg).toContain(">off</text>")
    expect(svg).toMatch(/stroke="var\(--active\)" stroke-width="4"/)
  })

  it("animates several frames, and holds the last one for readers who ask for less motion", () => {
    const svg = toSvg(laidout, [off, on], { title: "Toggle" })
    expect(svg).toContain("Step 2 of 2: TOGGLE")
    expect(svg).toContain("@media (prefers-reduced-motion:no-preference){@keyframes")
    // Outside the motion query the rings sit at their last frame: off hidden, on shown.
    expect(svg).toMatch(/ \.r\d+\{opacity:0\}.* \.r\d+\{opacity:1\}/)
    // Keyframe names are page-global: two animated charts inlined in one page must not share them.
    expect(svg).toMatch(/@keyframes autoviz-[a-z0-9]+-r\d+\{/)
    expect(svg).toMatch(/animation:autoviz-[a-z0-9]+-c\d+ /)
    expect(svg).not.toContain("\u0000")
  })

  it("gives different traces different scopes, even with the same captions", () => {
    const scopeOf = (svg: string) => /id="(autoviz-[a-z0-9]+)"/.exec(svg)?.[1]
    const same = { caption: "step" }
    const forward = toSvg(
      laidout,
      [
        { ...off, ...same },
        { ...on, ...same }
      ],
      { title: "Toggle" }
    )
    const back = toSvg(
      laidout,
      [
        { ...on, ...same },
        { ...off, ...same }
      ],
      { title: "Toggle" }
    )
    const slower = toSvg(
      laidout,
      [
        { ...off, ...same },
        { ...on, ...same }
      ],
      { title: "Toggle", stepMs: 3000 }
    )
    expect(new Set([scopeOf(forward), scopeOf(back), scopeOf(slower)]).size).toBe(3)
  })

  it("escapes text and scopes ids, so it can be inlined in any page", () => {
    const svg = toSvg(laidout, [off], { title: "<Toggle>" })
    expect(svg).toContain("A&amp;B&lt;C&gt;")
    expect(svg).toContain("<title")
    expect(svg).not.toContain("<Toggle>")
    expect(svg).toMatch(/marker-end="url\(#autoviz-[a-z0-9]+-arrow\)"/)
  })
})
