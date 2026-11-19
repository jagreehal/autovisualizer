import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { evaluate } from "../machine/evaluate"
import { toMachineGraph } from "../machine/graph"
import { machineFromMermaid, mermaidToConfig } from "./mermaid"

/** Converts, runs the code like the editor does, and lists the drawn edges. */
const edges = async (diagram: string) => {
  const { machines } = await Effect.runPromise(evaluate(machineFromMermaid(diagram)))
  return toMachineGraph(machines[0]!.machine, undefined).edges.map((e) => `${e.source} -${e.label}-> ${e.target}`)
}

describe("mermaid → machine", () => {
  it("flat diagram: initial, events, unnamed arrows, final, comments and styling skipped", async () => {
    const diagram = `---
title: traffic light
---
stateDiagram-v2
  direction LR
  %% a comment
  [*] --> Green
  Green --> Yellow : TIMER
  Yellow --> Red : TIMER %% trailing
  Red --> Green
  Red --> Off : POWER
  Off --> [*]
  Green : Cars go
  classDef warn fill:#fff
  note right of Red
    stop
  end note`
    expect(mermaidToConfig(diagram)).toMatchObject({
      id: "trafficLight",
      initial: "Green",
      states: { Green: { description: "Cars go" }, Off: { type: "final" } }
    })
    expect(await edges(diagram)).toEqual([
      "trafficLight.Green -TIMER-> trafficLight.Yellow",
      "trafficLight.Yellow -TIMER-> trafficLight.Red",
      "trafficLight.Red -Red--Green-> trafficLight.Green",
      "trafficLight.Red -POWER-> trafficLight.Off"
    ])
  })

  it("composite states, cross-scope targets by id, and a labelled exit to a final state", async () => {
    const diagram = `stateDiagram-v2
  [*] --> Idle
  Idle --> Checkout : BUY
  state "Paying for it" as Checkout {
    [*] --> Card
    Card --> Done : PAY
    Card --> [*] : CANCEL
  }
  Done --> Idle : RESET`
    const checkout = mermaidToConfig(diagram).states?.Checkout
    expect(checkout).toMatchObject({ description: "Paying for it", initial: "Card" })
    expect(checkout?.states?.done).toEqual({ type: "final" })
    expect(await edges(diagram)).toEqual([
      "Idle -BUY-> machine.Checkout",
      "machine.Checkout.Card -PAY-> machine.Checkout.Done",
      "machine.Checkout.Card -CANCEL-> machine.Checkout.done",
      "machine.Checkout.Done -RESET-> Idle"
    ])
  })

  it("concurrency: `--` splits a composite into parallel regions with their own initials", () => {
    const config = mermaidToConfig(`stateDiagram-v2
  [*] --> Active
  state Active {
    [*] --> NumOff
    NumOff --> NumOn : NUM
    --
    [*] --> CapsOff
    CapsOff --> CapsOn : CAPS
  }`)
    expect(config.states?.Active).toMatchObject({
      type: "parallel",
      states: {
        region: { initial: "NumOff", states: { NumOff: { on: { NUM: { target: "NumOn" } } }, NumOn: {} } },
        region2: { initial: "CapsOff", states: { CapsOff: {}, CapsOn: {} } }
      }
    })
  })

  it("rejects text that isn't a state diagram", () => {
    expect(() => machineFromMermaid("flowchart LR\n  A --> B")).toThrow(/stateDiagram-v2/)
  })
})

// Edge cases from Mermaid's state diagram parser specs (packages/mermaid/src/diagrams/state).
describe("mermaid → machine: edge cases from Mermaid's tests", () => {
  it("reads a block on one line, and rejects a state name with spaces as Mermaid does", () => {
    expect(mermaidToConfig("stateDiagram-v2\n  state valid { X }").states?.valid).toEqual({
      initial: "X",
      states: { X: {} }
    })
    expect(() => mermaidToConfig("stateDiagram-v2\n  state invalid syntax { Y }")).toThrow(/Line 2/)
  })

  it("skips styling, accessibility text, legacy layout lines and notes; reads arrows without spaces", async () => {
    const diagram = `stateDiagram
  accTitle: a title
  accDescr {
    a description
    on two lines
  }
  hide empty description
  scale 350 width
  classDef exampleStyleClass fill:#f00
  [*]:::exampleStyleClass --> a
  a-->b:::exampleStyleClass
  b:::exampleStyleClass
  class a exampleStyleClass
  style a fill:#fff
  note left of a : a short<br/>note
  note "A floating note" as N1`
    expect(mermaidToConfig(diagram)).toEqual({
      id: "machine",
      initial: "a",
      states: { a: { on: { "a--b": { target: "b" } } }, b: {} }
    })
    expect(await edges(diagram)).toEqual(["machine.a -a--b-> machine.b"])
  })

  it("keeps every description a state is given, and reads line breaks in labels as spaces", () => {
    const config = mermaidToConfig(`stateDiagram-v2
  state "Long state<br/>description" as s1
  s1 : more about it
  s1 --> s2 : should point to \\nthe next state`)
    expect(config.states?.s1).toEqual({
      description: "Long state description\nmore about it",
      on: { "should point to the next state": { target: "s2" } }
    })
  })

  it("an arrow to [*] claims its state for the scope it is written in", async () => {
    const diagram = `stateDiagram-v2
[*] --> Checkout
state Checkout {
  [*] --> review
  review --> paid
  review --> cancelled
  paid --> [*]
}
cancelled --> [*]`
    expect(mermaidToConfig(diagram).states).toMatchObject({
      Checkout: { states: { paid: { type: "final" } } },
      cancelled: { id: "cancelled", type: "final" }
    })
    expect(await edges(diagram)).toContain("machine.Checkout.review -review--cancelled-> cancelled")
  })

  it("keeps a state where it is first named unless an enclosing scope claims it", async () => {
    const diagram = `stateDiagram-v2
[*] --> Order
state Order {
  [*] --> draft
  state Checkout {
    [*] --> card
    card --> declined
    state Verify {
      [*] --> otp
      otp --> declined
      declined --> closed
    }
  }
  draft --> Checkout
  closed --> [*]
}`
    const nested = mermaidToConfig(diagram).states?.Order
    expect(Object.keys(nested?.states ?? {})).toEqual(["draft", "Checkout", "closed"])
    expect(Object.keys(nested?.states?.Checkout?.states ?? {})).toEqual(["card", "declined", "Verify"])
    expect(nested?.states?.closed).toEqual({ id: "closed", type: "final" })
    expect(await edges(diagram)).toContain("declined -declined--closed-> closed")
  })

  it("gives each parallel region its own final state, and maps an onDone arrow", async () => {
    const diagram = `stateDiagram-v2
[*] --> preparing
state preparing {
  [*] --> grindingBeans
  grindingBeans --> beansGround : BEANS_GROUND
  beansGround --> [*]
  --
  [*] --> boilingWater
  boilingWater --> waterBoiled : WATER_BOILED
  waterBoiled --> [*]
}
preparing --> makingCoffee : onDone
makingCoffee --> [*]`
    expect(mermaidToConfig(diagram).states?.preparing).toEqual({
      type: "parallel",
      states: {
        region: {
          initial: "grindingBeans",
          states: {
            grindingBeans: { on: { BEANS_GROUND: { target: "beansGround" } } },
            beansGround: { type: "final" }
          }
        },
        region2: {
          initial: "boilingWater",
          states: {
            boilingWater: { on: { WATER_BOILED: { target: "waterBoiled" } } },
            waterBoiled: { type: "final" }
          }
        }
      },
      onDone: { target: "makingCoffee" }
    })
    expect(await edges(diagram)).toContain("machine.preparing -onDone-> machine.makingCoffee")
  })

  it("names added final states apart from every state, so ids stay unique", async () => {
    const diagram = `stateDiagram-v2
[*] --> Parked
Parked --> [*]
Parked --> Driving
Driving --> Parked : PARK
Driving --> Breakdown : BREAK
state Breakdown {
  [*] --> done
  done --> Parked
  done --> [*]
}
Breakdown --> [*] : onDone`
    const config = mermaidToConfig(diagram)
    expect(Object.keys(config.states ?? {})).toEqual(["Parked", "Driving", "Breakdown", "done2"])
    expect(config.states?.Breakdown).toMatchObject({
      states: { done3: { type: "final" } },
      onDone: { target: "done2" }
    })
    expect(await edges(diagram)).toEqual([
      "Parked -Parked--done2-> machine.done2",
      "Parked -Parked--Driving-> machine.Driving",
      "machine.Driving -PARK-> Parked",
      "machine.Driving -BREAK-> machine.Breakdown",
      "machine.Breakdown -onDone-> machine.done2",
      "machine.Breakdown.done -done--Parked-> Parked",
      "machine.Breakdown.done -done--done3-> machine.Breakdown.done3"
    ])
  })

  it("reads on after a floating note, wherever it is", () => {
    const config = mermaidToConfig(`stateDiagram-v2
  note "A floating note" as N1
  [*] --> A
  A --> B : GO
  note left of B
    a block note
  end note
  B --> A : BACK`)
    expect(config.states).toEqual({ A: { on: { GO: { target: "B" } } }, B: { on: { BACK: { target: "A" } } } })
  })

  it("reads on after a note or accessibility description written on one line", () => {
    const config = mermaidToConfig(`stateDiagram-v2
  note right of A:hello
  accDescr { A description }
  accTitle { A title }
  [*] --> A
  A --> B : GO`)
    expect(config.states).toEqual({ A: { on: { GO: { target: "B" } } }, B: {} })
  })

  it("reads on after an accessibility description whose last line closes it", () => {
    const config = mermaidToConfig(`stateDiagram-v2
  accDescr {
    A multiline
    Description }
  [*] --> A
  A --> B : GO`)
    expect(config.states).toEqual({ A: { on: { GO: { target: "B" } } }, B: {} })
  })

  it("rejects unmatched braces and blocks that never close", () => {
    expect(() => mermaidToConfig("stateDiagram-v2\n  state Outer {\n    A --> B")).toThrow(
      '"state Outer {" is never closed'
    )
    expect(() => mermaidToConfig("stateDiagram-v2\n  A --> B\n  }")).toThrow('Line 3: "}" closes no state')
    expect(() => mermaidToConfig("stateDiagram-v2\n  note left of A\n  A --> B")).toThrow("never closed")
  })

  it("reads an empty block, with or without a space, as a plain state", () => {
    for (const block of ["state Empty {}", "state Empty{}", "state Empty { }"]) {
      const config = mermaidToConfig(`stateDiagram-v2\n  ${block}\n  [*] --> Empty`)
      expect(config.states).toEqual({ Empty: {} })
    }
  })

  it("treats a state with an empty block as the leaf it is, final included", () => {
    const plain = mermaidToConfig("stateDiagram-v2\n  [*] --> Empty\n  Empty --> [*]")
    const blocked = mermaidToConfig("stateDiagram-v2\n  state Empty {}\n  [*] --> Empty\n  Empty --> [*]")
    expect(blocked).toEqual(plain)
    expect(blocked.states).toEqual({ Empty: { type: "final" } })
  })

  it("reads the title only from front matter, not from a state named title", () => {
    const config = mermaidToConfig("---\nconfig: {}\n---\nstateDiagram-v2\ntitle: a description\n[*] --> title")
    expect(config.id).toBe("machine")
    const blank = mermaidToConfig("---\ntitle:\nconfig: {}\n---\nstateDiagram-v2\n[*] --> A")
    expect(blank.id).toBe("machine")
    const commented = mermaidToConfig("---\ntitle: Demo # Comment\n---\nstateDiagram-v2\n[*] --> A")
    expect(commented.id).toBe("Demo")
    const onlyComment = mermaidToConfig("---\ntitle: # Comment\n---\nstateDiagram-v2\n[*] --> A")
    expect(onlyComment.id).toBe("machine")
    const quoted = mermaidToConfig('---\ntitle: "Demo # 2" # Comment\n---\nstateDiagram-v2\n[*] --> A')
    expect(quoted.id).toBe("Demo2")
  })

  it("counts front matter in the line numbers of errors", () => {
    expect(() => mermaidToConfig("---\ntitle: T\n---\nstateDiagram-v2\n  A --> B\n  }")).toThrow('Line 6: "}"')
  })

  it("gives dotted Mermaid ids keys XState accepts, in states, initials, targets and ids", async () => {
    const diagram = `stateDiagram-v2
  [*] --> v1.0
  v1.0 --> v1.2 : GO
  v1_2 --> v1.0 : SAME_NAME_ONCE_ENCODED
  state release {
    [*] --> rc.1
    rc.1 --> v1.0 : SHIP
  }
  v1.2 --> release : NEXT`
    const config = mermaidToConfig(diagram)
    expect(config.initial).toBe("v1_0")
    expect(Object.keys(config.states ?? {})).toEqual(["v1_0", "v1_22", "v1_2", "release"])
    expect(config.states?.release).toMatchObject({
      initial: "rc_1",
      states: { rc_1: { on: { SHIP: { target: "#v1_0" } } } }
    })
    expect(await edges(diagram)).toEqual([
      "v1_0 -GO-> machine.v1_22",
      "machine.v1_22 -NEXT-> machine.release",
      "machine.v1_2 -SAME_NAME_ONCE_ENCODED-> v1_0",
      "machine.release.rc_1 -SHIP-> v1_0"
    ])
  })

  it("keeps events whose names an object inherits, such as constructor and __proto__", async () => {
    const diagram = `stateDiagram-v2
  [*] --> A
  A --> B : constructor
  A --> C : toString
  A --> D : __proto__
  A --> E : hasOwnProperty`
    expect(await edges(diagram)).toEqual([
      "machine.A -constructor-> machine.B",
      "machine.A -toString-> machine.C",
      "machine.A -__proto__-> machine.D",
      "machine.A -hasOwnProperty-> machine.E"
    ])
  })

  it("gives the machine an id no state has, so a state reached by id can't clash with it", async () => {
    const reachedByName = `stateDiagram-v2
  [*] --> Outer
  Outer --> machine : STOP
  state Outer {
    [*] --> inner
    inner --> machine : LEAVE
  }`
    expect(mermaidToConfig(reachedByName).id).toBe("machine2")
    expect(await edges(reachedByName)).toContain("machine2.Outer.inner -LEAVE-> machine")

    const reachedByTitle = `---
title: Outer
---
stateDiagram-v2
  [*] --> Outer
  state Outer {
    [*] --> inner
    inner --> Outer : RESTART
  }`
    expect(mermaidToConfig(reachedByTitle).id).toBe("Outer2")
    expect(await edges(reachedByTitle)).toContain("Outer2.Outer.inner -RESTART-> Outer")
  })

  it("exports `machine` whatever the title, so the module is always valid code", () => {
    const code = machineFromMermaid("---\ntitle: 2024 delete plan\n---\nstateDiagram-v2\n  [*] --> a")
    expect(code).toContain('export const machine = createMachine({\n  id: "2024DeletePlan"')
  })
})
