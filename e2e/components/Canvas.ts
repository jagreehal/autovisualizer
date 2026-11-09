import type { Locator, Page } from "@playwright/test"

/** The statechart canvas: states, event pills and the canvas tool bar. */
export class Canvas {
  readonly root: Locator
  readonly breadcrumb: Locator

  constructor(page: Page) {
    this.root = page.getByRole("region", { name: "Statechart" })
    this.breadcrumb = this.root.getByRole("navigation", { name: "Breadcrumb" })
  }

  state(name: string): Locator {
    return this.root.getByRole("group", { name, exact: true })
  }

  /** The event pill a user can click right now (its source state is active). */
  event(label: string, branch?: number): Locator {
    const name = branch === undefined ? label : `${label} (branch ${branch})`
    return this.root.getByRole("button", { name, exact: true, disabled: false })
  }

  /** Every pill for `label`, enabled or not. */
  pills(label: string): Locator {
    return this.root.getByRole("button", { name: label, exact: true })
  }

  async send(label: string, branch?: number) {
    await this.event(label, branch).click()
  }

  async reset() {
    await this.root.getByRole("button", { name: "Reset simulation" }).click()
  }

  async inspect(stateName: string) {
    await this.root.getByRole("button", { name: "Inspect states" }).click()
    await this.state(stateName).click()
  }
}
