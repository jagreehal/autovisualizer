import { expect, test } from "./fixtures"

// A MachineJSON definition as another tool would write it: a v6 guard as `@code`,
// and an invoke whose actor is only a name.
const ORDER = {
  id: "order",
  initial: "placed",
  context: { total: 120 },
  states: {
    placed: {
      on: {
        REVIEW: {
          "@code": "({ context }) => context.total > 100 ? { target: 'manual' } : { target: 'shipping' }",
          "@lang": "ts"
        }
      }
    },
    manual: { invoke: { src: "fraudCheck", onDone: { target: "shipping" } } },
    shipping: { type: "final" }
  }
}

test.describe("XState MachineJSON", () => {
  test("export writes the machine as MachineJSON, keeping guards as @code", async ({ visualizer }) => {
    await visualizer.goto()

    const { name, json } = await visualizer.exportMachineJson()

    expect(name).toBe("checkout.machine.json")
    expect(json).toMatchObject({ id: "checkout", initial: "idle" })
    expect(json.states.payment.on.FAIL["@code"]).toContain('target: "declined"')
  })

  test("importing a definition draws it, guard branches included", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.openFile("order.machine.json", JSON.stringify(ORDER))

    await expect(visualizer.summary).toContainText("machine: order")
    await expect(visualizer.canvas.pills("REVIEW (branch 1)")).toHaveCount(1)
    await expect(visualizer.canvas.pills("REVIEW (branch 2)")).toHaveCount(1)
    await expect(visualizer.canvas.state("manual").getByText("fraudCheck")).toBeVisible()
  })

  test("an imported definition simulates: its @code guard runs and named actors wait", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.openFile("order.machine.json", JSON.stringify(ORDER))

    await visualizer.canvas.send("REVIEW", 1)
    await expect(visualizer.canvas.state("manual")).toHaveAttribute("aria-current", "true")

    await visualizer.canvas.send("done: fraudCheck")
    await expect(visualizer.canvas.state("shipping")).toHaveAttribute("aria-current", "true")
  })

  test("export then import gives back the same machine", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("approval")
    const { json } = await visualizer.exportMachineJson()

    await visualizer.openFile("approval.machine.json", JSON.stringify(json))

    await expect(visualizer.summary).toContainText("6 states")
    await expect(visualizer.summary).toContainText("8 transitions")
    await expect(visualizer.summary).toContainText("1 inferred")
  })

  test("a file that is not a definition is rejected", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.openFile("nope.json", "[1, 2, 3]")

    await expect(visualizer.notifications.getByText("Not a machine definition")).toBeVisible()
    await expect(visualizer.summary).toContainText("machine: checkout")
  })
})
