import { expect } from "@playwright/test"
import LZString from "lz-string"

import { Canvas } from "../components/Canvas"
import { Sidebar } from "../components/Sidebar"
import { SimulationPanel } from "../components/SimulationPanel"

import type { Locator, Page } from "@playwright/test"

type Panel = "Simulation" | "Validations" | "Details"

export class VisualizerPage {
  readonly canvas: Canvas
  readonly simulation: SimulationPanel
  readonly sidebar: Sidebar
  readonly summary: Locator
  readonly notifications: Locator

  constructor(private readonly page: Page) {
    this.canvas = new Canvas(page)
    this.simulation = new SimulationPanel(page)
    this.sidebar = new Sidebar(page)
    this.summary = page.getByRole("status", { name: "Graph summary" })
    this.notifications = page.getByRole("region", { name: /Notifications/ })
  }

  /** Open the app with the default example and wait for its chart. */
  async goto() {
    await this.page.goto("/")
    await this.assertLoaded()
  }

  /** Open the app on a share link carrying `code`, without running it. */
  async gotoSharedLink(code: string) {
    await this.page.goto(`/#code=${LZString.compressToEncodedURIComponent(code)}`)
  }

  /** Open a share link carrying `code` and accept running it. */
  async gotoWithCode(code: string) {
    await this.gotoSharedLink(code)
    await this.runSharedCode()
  }

  async runSharedCode() {
    await this.page.getByRole("button", { name: "Run this code" }).click()
  }

  async assertLoaded() {
    await expect(this.summary).toBeVisible()
  }

  panel(name: Panel): Locator {
    return this.page.getByRole("complementary", { name })
  }

  async openPanel(name: Panel) {
    const button = this.page.getByRole("button", { name: new RegExp(`^${name}`) })
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click()
    await expect(this.panel(name)).toBeVisible()
  }

  /** A Code or Canvas toggle in the column switcher. */
  column(name: "Code" | "Canvas"): Locator {
    return this.page.getByRole("toolbar", { name: "Columns" }).getByRole("button", { name })
  }

  async runCommand(label: string) {
    await this.page.keyboard.press("ControlOrMeta+k")
    const menu = this.page.getByRole("dialog", { name: "Command menu" })
    await menu.getByRole("combobox").fill(label)
    await menu.getByRole("option", { name: label }).click()
  }

  async toggleTheme() {
    await this.page.getByRole("button", { name: "Toggle theme" }).click()
  }

  /** Import a file through the Open button, as if picked from disk. */
  async openFile(name: string, contents: string) {
    await this.page.getByLabel("Open file").setInputFiles({
      name,
      mimeType: name.endsWith(".json") ? "application/json" : "text/typescript",
      buffer: Buffer.from(contents)
    })
  }

  /** Pick an item from the Save menu and return the downloaded file's name and text. */
  async saveAs(item: RegExp) {
    const download = this.page.waitForEvent("download")
    await this.page.getByRole("button", { name: "Save", exact: true }).click()
    await this.page.getByRole("menuitem", { name: item }).click()
    const file = await download
    const stream = await file.createReadStream()
    const chunks: Array<Buffer> = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    return { name: file.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") }
  }

  /** Export the current machine as MachineJSON and return the file's name and parsed contents. */
  async exportMachineJson() {
    const { name, text } = await this.saveAs(/MachineJSON/)
    return { name, json: JSON.parse(text) }
  }

  async copyShareLink(): Promise<string> {
    await this.page.getByRole("button", { name: "Share" }).click()
    await expect(this.notifications.getByText("Link copied")).toBeVisible()
    return this.page.evaluate(() => navigator.clipboard.readText())
  }
}
