import { expect, test } from "./fixtures"

test.describe("Visualizing a machine", () => {
  test("the checkout example draws every state with the initial state active", async ({ visualizer }) => {
    await visualizer.goto()

    for (const name of ["idle", "cart", "address", "payment", "declined", "refund", "confirmed"]) {
      await expect(visualizer.canvas.state(name)).toBeVisible()
    }
    await expect(visualizer.canvas.state("idle")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.summary).toContainText("7 states")
    await expect(visualizer.summary).toContainText("10 transitions")
  })

  test("literal targets inside a v6 guard become numbered branch edges", async ({ visualizer }) => {
    await visualizer.goto()

    await expect(visualizer.canvas.pills("FAIL (branch 1)")).toHaveCount(1)
    await expect(visualizer.canvas.pills("FAIL (branch 2)")).toHaveCount(1)
    await expect(visualizer.summary).toContainText("3 inferred")
  })

  test("validations flag an unreachable state", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.openPanel("Validations")

    await expect(visualizer.panel("Validations")).toContainText("refund is unreachable")
    await expect(visualizer.canvas.state("refund").getByRole("img", { name: /Unreachable/ })).toBeVisible()
  })

  test("a transition function with a computed target is reported, not drawn", async ({ visualizer }) => {
    await visualizer.gotoWithCode(`import { createMachine } from "xstate"
const pick = (to: string) => to
export const router = createMachine({
  id: "router",
  initial: "home",
  states: {
    home: { on: { GO: ({ event }) => ({ target: pick(event.to) }) } },
    away: {}
  }
})`)
    await visualizer.assertLoaded()
    await visualizer.openPanel("Validations")

    await expect(visualizer.panel("Validations")).toContainText("home · GO")
    await expect(visualizer.summary).toContainText("1 unresolved")
  })

  test("a parallel machine shows every region's initial state as active", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("parallel")

    await expect(visualizer.canvas.state("pending")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.canvas.state("running")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.canvas.state("approved")).not.toHaveAttribute("aria-current", "true")
  })

  test("an unexported @xstate/effect machine is named after its export", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("approval")

    await expect(visualizer.summary).toContainText("machine: approvalMachine")
    await expect(visualizer.canvas.state("awaitingApproval")).toHaveAttribute("aria-current", "true")
  })
})
