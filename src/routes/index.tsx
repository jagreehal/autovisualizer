import { createFileRoute } from "@tanstack/react-router"

import { App } from "@/app/App"

export const Route = createFileRoute("/")({
  // Monaco, React Flow and the worker are browser-only.
  ssr: false,
  component: App
})
