import type { Locator, Page } from "@playwright/test"

/** The machines sidebar: machines in the current file and the bundled examples. */
export class Sidebar {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole("complementary", { name: "Machines" })
  }

  /** A machine or example entry, matched by its leading name. */
  entry(name: string): Locator {
    return this.root.getByRole("button", { name: new RegExp(`^${name}\\b`) })
  }

  async loadExample(name: string) {
    await this.root.getByRole("button", { name, exact: true }).click()
  }

  async filter(text: string) {
    await this.root.getByRole("textbox").fill(text)
  }
}
