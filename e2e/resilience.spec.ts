import { expect, test } from "./fixtures"

test.describe("Bad code", () => {
  test("a syntax error is reported", async ({ visualizer }) => {
    await visualizer.gotoWithCode("const = ;")

    await expect(visualizer.notifications.getByText("CompileError")).toBeVisible()
  })

  test("code without a machine says so", async ({ visualizer }) => {
    await visualizer.gotoWithCode("export const answer = 42")

    await expect(visualizer.notifications.getByText("NoMachineError")).toBeVisible()
  })

  test("an infinite loop is stopped and the app keeps working", async ({ visualizer }) => {
    await visualizer.gotoWithCode("while (true) {}")

    await expect(visualizer.notifications.getByText("Timeout")).toBeVisible({ timeout: 10_000 })

    await visualizer.sidebar.loadExample("checkout")
    await expect(visualizer.summary).toContainText("machine: checkout")
  })
})
