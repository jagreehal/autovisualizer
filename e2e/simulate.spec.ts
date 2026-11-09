import { expect, test } from "./fixtures"

test.describe("Simulating a machine", () => {
  test("clicking events walks checkout to its final state", async ({ visualizer }) => {
    await visualizer.goto()

    for (const event of ["ADD_ITEM", "CHECKOUT", "SUBMIT", "PAID"]) await visualizer.canvas.send(event)

    await expect(visualizer.canvas.state("confirmed")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.simulation.status).toContainText("done")
    await expect(visualizer.simulation.context).toContainText('"items": 1')
  })

  test("only events the active state accepts can be clicked", async ({ visualizer }) => {
    await visualizer.goto()

    await expect(visualizer.canvas.pills("CHECKOUT")).toBeDisabled()
    await visualizer.canvas.send("ADD_ITEM")
    await expect(visualizer.canvas.pills("CHECKOUT")).toBeEnabled()
  })

  test("a guard runs: the first failed payment retries, later ones decline", async ({ visualizer }) => {
    await visualizer.goto()
    for (const event of ["ADD_ITEM", "CHECKOUT", "SUBMIT"]) await visualizer.canvas.send(event)

    await visualizer.simulation.send("FAIL")
    await expect(visualizer.simulation.value).toContainText('"payment"')
    await expect(visualizer.simulation.context).toContainText('"attempts": 1')

    await visualizer.simulation.send("FAIL")
    await visualizer.simulation.send("FAIL")
    await expect(visualizer.canvas.state("declined")).toHaveAttribute("aria-current", "true")
  })

  test("reset on the canvas returns to the initial state and clears the log", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.canvas.send("ADD_ITEM")
    await expect(visualizer.simulation.eventsSent).toContainText("ADD_ITEM")

    await visualizer.canvas.reset()

    await expect(visualizer.canvas.state("idle")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.simulation.eventsSent).toContainText("None yet.")
  })

  test("invoked actors finish when their done event is sent with a payload", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("approval")
    await visualizer.simulation.setInput('{ "release": "v1.2.0" }')
    await visualizer.simulation.reset()
    await visualizer.canvas.send("APPROVE")

    await visualizer.simulation.sendCustom(
      '{ "type": "xstate.done.actor", "actorId": "deploying:0", "output": "https://example.com/v1.2.0" }'
    )

    await expect(visualizer.canvas.state("deployed")).toHaveAttribute("aria-current", "true")
    await expect(visualizer.simulation.context).toContainText('"url": "https://example.com/v1.2.0"')
  })

  test("an event no state handles is logged as not handled", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.simulation.sendCustom('{ "type": "NOPE" }')

    await expect(visualizer.simulation.status).toContainText("last event not handled")
    await expect(visualizer.simulation.eventsSent).toContainText("(not handled)")
  })
})
