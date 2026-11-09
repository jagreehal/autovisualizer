import { expect, test } from "./fixtures"

test.describe("Workspace", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("a share link reopens the same machine in a fresh tab", async ({ visualizer, context }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("approval")
    const link = await visualizer.copyShareLink()

    const fresh = await context.newPage()
    await fresh.goto(link)
    await expect(fresh.getByRole("status", { name: "Graph summary" })).toContainText("machine: approvalMachine")
  })

  test("code survives a reload through autosave", async ({ visualizer, page }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("parallel")
    await expect(visualizer.summary).toContainText("machine: release")

    await page.reload()

    await expect(visualizer.summary).toContainText("machine: release")
  })

  test("the command menu loads an example", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.runCommand("Load approval")

    await expect(visualizer.summary).toContainText("machine: approvalMachine")
  })

  test("loading an example can be undone", async ({ visualizer }) => {
    await visualizer.goto()
    await visualizer.sidebar.loadExample("parallel")

    await visualizer.notifications.getByRole("button", { name: "Undo" }).click()

    await expect(visualizer.summary).toContainText("machine: checkout")
  })

  test("inspecting a state shows its transitions", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.canvas.inspect("declined")

    const details = visualizer.panel("Details")
    await expect(details).toContainText("checkout.declined")
    await expect(details).toContainText("RETRY")
    await expect(visualizer.canvas.breadcrumb).toContainText("declined")
  })

  test("the theme choice persists across reloads", async ({ visualizer, page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await visualizer.goto()
    await expect(page.locator("html")).toHaveClass(/dark/)

    await visualizer.toggleTheme()
    await page.reload()

    await expect(page.locator("html")).not.toHaveClass(/dark/)
  })

  test("the sidebar filter narrows the examples", async ({ visualizer }) => {
    await visualizer.goto()

    await visualizer.sidebar.filter("par")

    await expect(visualizer.sidebar.entry("parallel")).toBeVisible()
    await expect(visualizer.sidebar.entry("approval")).toBeHidden()
  })
})
