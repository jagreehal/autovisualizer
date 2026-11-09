import type { Locator, Page } from "@playwright/test"

/** The Simulation side panel. */
export class SimulationPanel {
  readonly root: Locator
  readonly status: Locator
  readonly value: Locator
  readonly context: Locator
  readonly eventsSent: Locator

  constructor(page: Page) {
    this.root = page.getByRole("complementary", { name: "Simulation" })
    this.status = this.root.getByRole("region", { name: "Status" })
    this.value = this.root.getByRole("region", { name: "Value" })
    this.context = this.root.getByRole("region", { name: "Context" })
    this.eventsSent = this.root.getByRole("region", { name: "Events sent" })
  }

  async send(label: string) {
    await this.root.getByRole("button", { name: label, exact: true }).click()
  }

  async sendCustom(eventJson: string) {
    await this.root.getByRole("textbox", { name: "Custom event JSON" }).fill(eventJson)
    await this.root.getByRole("button", { name: "Send", exact: true }).click()
  }

  async setInput(inputJson: string) {
    await this.root.getByRole("textbox", { name: "Machine input JSON" }).fill(inputJson)
  }

  async reset() {
    await this.root.getByRole("button", { name: "Reset" }).click()
  }
}
