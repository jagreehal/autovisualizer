/**
 * <auto-visualizer>: the interactive canvas on its own, for docs sites and other
 * pages that want a machine diagram without the editor. Built by vite.embed.config.ts.
 */
import "@/styles.css"

import sansUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url"
import monoUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url"

import { Effect, ManagedRuntime, Schema } from "effect"
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Canvas } from "@/canvas/Canvas"
import { countsByEdge, takenEdges } from "@/canvas/overlay"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MachineWorker } from "@/machine/client"
import { isString, JsonEvent } from "@/machine/json"
import { codeFromDefinition } from "@/machine/definition"

import type { Simulation } from "@/canvas/Canvas"
import type { MachineGraph } from "@/machine/graph"
import type { SimView } from "@/machine/simulate"

// Written out, not imported: the embed typings are generated from this file alone.
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

interface WalkthroughStep {
  /** The event to send: its type, or the whole event when it carries data, `{"type":"xstate.done.actor.pay","output":42}`. */
  event: string | { type: string; [key: string]: JsonValue }
  /** What this step shows, under the chart. */
  note?: string
}

interface StatechartProps {
  /** Machine source, TypeScript or JavaScript. It may import xstate, effect and the xstate effect package. Wins over `src`. */
  code?: string
  /** URL of a machine module (.ts/.js) or a MachineJSON file (.json). */
  src?: string
  /** Id of the machine to show when the code creates several. Defaults to the first. */
  machine?: string
  /** light, dark, or auto to follow the reader's system setting. Defaults to auto. */
  theme?: "light" | "dark" | "auto"
  /** The machine's input, as JSON. */
  input?: JsonObject
  /**
   * The state to open in, as its path (`payment.processing`) or full id. In parallel states, name one state per
   * region, space-separated. The machine starts as if its initial states led there: the usual initial route is
   * skipped, but entry actions, eventless transitions and done events run, so a state that passes straight
   * through opens where it lands.
   */
  state?: string
  /**
   * Context to start with, as JSON, laid over the machine's own. It's set before the machine starts, so guards see
   * it and entry actions can still change it. Works with or without `state`.
   */
  context?: JsonObject
  /**
   * Events to send before the chart shows: where the story starts. Event types, space-separated, or a JSON array
   * of types and whole events, `[{"type":"xstate.done.actor.pay","output":42}]`.
   */
  events?: string
  /** Steps to walk through, each an event and a note. Adds step controls under the chart. */
  walkthrough?: Array<WalkthroughStep>
  /** Step through the walkthrough on its own. Off for readers who ask for less motion. */
  autoplay?: boolean
  /**
   * How often each transition was taken, by state then event: `{"payment":{"PAID":120,"DECLINED":0}}`. Each count
   * shows on its event, and a transition taken 0 times is drawn dashed. A state is its key or its full id.
   */
  // Written out, not EdgeCounts: the embed typings and attribute parsing are generated from this interface alone.
  counts?: Record<string, Record<string, number>>
  /** right, down, or auto (the default): top to bottom in containers narrower than 520px. */
  direction?: "auto" | "right" | "down"
}

const STEP_MS = 1800
// One empty walkthrough for every chart without one: a fresh `[]` per render would re-run the load.
const NO_STEPS: Array<WalkthroughStep> = []
const NO_TRAIL: ReadonlyArray<string> = []
const NO_COUNTS: Record<string, Record<string, number>> = {}
const NO_JSON: JsonObject = {}
const eventOf = (step: WalkthroughStep) => (isString(step.event) ? { type: step.event } : step.event)

const decodeEvents = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(Schema.Union([Schema.String, JsonEvent])))
)

/** `events` as names (`ADD_ITEM CHECKOUT`), or as a JSON array of names and whole events. */
const eventsFrom = (events: string) =>
  events.trimStart().startsWith("[")
    ? decodeEvents(events).pipe(
        Effect.map((list) => list.map((event) => (isString(event) ? { type: event } : event))),
        Effect.mapError((cause) => new Error(`The events attribute isn't a list of events: ${cause.message}`))
      )
    : Effect.succeed(
        events
          .split(/\s+/)
          .filter(Boolean)
          .map((type) => ({ type }))
      )

/** Follow a media query, such as the reader's colour scheme. */
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const change = () => setMatches(media.matches)
    media.addEventListener("change", change)
    return () => media.removeEventListener("change", change)
  }, [query])
  return matches
}

/**
 * Shadow roots ignore `@property`, which leaves Tailwind's ring and shadow variables
 * unset. Tailwind's own fallback for that sets them on every element; do the same,
 * from whatever `@property` rules the shadow root's stylesheets carry.
 */
const propertyDefaults = (root: ShadowRoot) => {
  const declarations = root.adoptedStyleSheets
    .flatMap((sheet) => [...sheet.cssRules])
    .filter((rule) => rule instanceof CSSPropertyRule)
    .map((rule) => `${rule.name}:${rule.initialValue ?? "initial"}`)
  return `@layer properties{*,::before,::after,::backdrop{${declarations.join(";")}}}`
}

// @font-face is ignored inside a shadow root, and the layout measures labels in these fonts,
// so register them on the page. Latin subsets only; other scripts use the fallback font.
for (const [family, url] of [
  ["Geist Variable", sansUrl],
  ["Geist Mono Variable", monoUrl]
]) {
  document.fonts.add(new FontFace(family, `url(${url})`, { weight: "100 900", display: "swap" }))
}

const HOST = `:host,[data-mountly-root]{height:100%;-webkit-tap-highlight-color:transparent}button{touch-action:manipulation}`

// WorkerError and DefinitionError are Errors too.
const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

async function sourceFrom(code: string | undefined, src: string | undefined): Promise<string> {
  if (code !== undefined) return code
  if (src === undefined) throw new Error("Set the code or src attribute.")
  const url = new URL(src, location.href)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${src}: ${response.status} ${response.statusText}`)
  const text = await response.text()
  if (!url.pathname.endsWith(".json")) return text
  return Effect.runPromise(codeFromDefinition(text, url.pathname.split("/").pop() ?? "machine.json"))
}

export default function Statechart({
  code,
  src,
  machine,
  theme = "auto",
  input = NO_JSON,
  state,
  context = NO_JSON,
  events,
  walkthrough = NO_STEPS,
  autoplay = false,
  counts = NO_COUNTS,
  direction = "auto"
}: StatechartProps) {
  // One worker per element: the worker holds a single simulation.
  const [runtime] = useState(() => ManagedRuntime.make(MachineWorker.layer))
  useEffect(() => () => void runtime.dispose(), [runtime])

  const [graph, setGraph] = useState<MachineGraph | undefined>()
  const [index, setIndex] = useState(0)
  const [sim, setSim] = useState<SimView | undefined>()
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string | undefined>()
  const [taken, setTaken] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | undefined>()
  const [properties, setProperties] = useState("")
  const anchor = useRef<HTMLDivElement>(null)
  // replay() runs in the same tick the graph loads, before its state is visible: read the graph from here.
  const graphRef = useRef<MachineGraph | undefined>(undefined)

  const prefersDark = useMedia("(prefers-color-scheme: dark)")
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)")
  const [playing, setPlaying] = useState(autoplay && !reducedMotion)
  const dark = theme === "dark" || (theme === "auto" && prefersDark)

  const run = useCallback(
    <A,>(program: Effect.Effect<A, unknown, MachineWorker>) =>
      runtime.runPromise(program).catch((cause: unknown) => {
        setError(errorMessage(cause))
        return undefined
      }),
    [runtime]
  )

  /**
   * Start machine `at` and send `events`, then the first `count` walkthrough steps. Transitions
   * are pure, so replaying from the start is instant, and going back a step is a shorter replay.
   * An event the machine doesn't accept shows an error.
   */
  const replay = useCallback(
    async (at: number, count: number) => {
      const opening = await run(eventsFrom(events ?? ""))
      if (opening === undefined) return
      const sends = [...opening, ...walkthrough.slice(0, count).map(eventOf)]
      const start = (worker: MachineWorker["Service"]) =>
        worker.start(at, JSON.stringify(input), state, JSON.stringify(context))
      let view = (await run(MachineWorker.use(start)))?.view
      const path = new Set<string>()
      for (const event of sends) {
        if (view === undefined) return
        const before = view
        view = (await run(MachineWorker.use((worker) => worker.send(JSON.stringify(event)))))?.view
        if (view !== undefined && !view.handled) {
          setError(`"${event.type}" isn't accepted in state ${before.valueJson.replace(/\s+/g, " ")}`)
          return
        }
        if (view !== undefined && graphRef.current !== undefined)
          for (const id of takenEdges(graphRef.current, view.taken)) path.add(id)
      }
      setSim(view)
      setTaken(path)
      setStep(count)
    },
    [run, input, state, context, events, walkthrough]
  )

  // The custom element in the page, whose id names this chart in deep links: #<id>/<step>.
  const host = () => {
    const root = anchor.current?.getRootNode()
    return root instanceof ShadowRoot ? root.host.parentElement : null
  }
  const go = (count: number) => {
    void replay(index, count)
    const id = host()?.id
    if (id) history.replaceState(null, "", `#${id}/${count}`)
  }

  useEffect(() => {
    let cancelled = false
    setError(undefined)
    void sourceFrom(code, src)
      // A replaced load must not reach the worker: it would swap the machine under the new diagram.
      .then((source) => (cancelled ? undefined : run(MachineWorker.use((worker) => worker.load(source)))))
      .then(async (loaded) => {
        if (cancelled || loaded === undefined) return
        const found = machine === undefined ? 0 : loaded.machines.findIndex((graph) => graph.id === machine)
        if (found < 0) {
          const ids = loaded.machines.map((graph) => graph.id).join(", ")
          return setError(`No machine "${machine}" here. The code creates: ${ids}`)
        }
        graphRef.current = loaded.machines[found]
        setGraph(loaded.machines[found])
        setIndex(found)
        setSelected(undefined)
        // A deep link (#<id>/<step>) opens the walkthrough at that step.
        const id = host()?.id
        const linked = id && location.hash.startsWith(`#${id}/`) ? Number(location.hash.slice(id.length + 2)) : 0
        await replay(found, Number.isInteger(linked) ? Math.min(Math.max(linked, 0), walkthrough.length) : 0)
      })
      .catch((cause: unknown) => !cancelled && setError(errorMessage(cause)))
    return () => {
      cancelled = true
    }
  }, [code, src, machine, run, replay, walkthrough.length])

  // Autoplay: one step at a time, stopping at the end.
  useEffect(() => {
    if (!playing || graph === undefined) return
    if (step >= walkthrough.length) return setPlaying(false)
    const timer = setTimeout(() => void replay(index, step + 1), STEP_MS)
    return () => clearTimeout(timer)
  }, [playing, step, graph, index, replay, walkthrough.length])

  // Theme and the @property fallback live on the shadow root, which portals (tooltips, popovers) share.
  useEffect(() => {
    const root = anchor.current?.getRootNode()
    if (!(root instanceof ShadowRoot)) return
    setProperties(propertyDefaults(root))
    for (const child of root.children) child.classList.toggle("dark", dark)
  }, [dark])

  const simulation = useMemo<Simulation>(
    () => ({
      active: new Set(sim?.active ?? []),
      enabled: new Set(sim?.nextEvents.map((event) => event.eventJson) ?? []),
      send: (eventJson) =>
        void run(MachineWorker.use((worker) => worker.send(eventJson))).then((result) => result && setSim(result.view))
    }),
    [sim, run]
  )

  const edgeCounts = useMemo(() => (graph === undefined ? undefined : countsByEdge(graph, counts)), [graph, counts])
  const current = walkthrough[step - 1]

  return (
    <div ref={anchor} className="flex h-full flex-col bg-sc-canvas font-sans text-foreground antialiased">
      <style>{HOST + properties}</style>
      {error !== undefined ? (
        <p role="alert" className="p-4 font-mono text-sm text-destructive">
          {error}
        </p>
      ) : graph === undefined ? null : (
        <TooltipProvider delayDuration={300}>
          <div className="relative min-h-0 flex-1">
            <Canvas
              graph={graph}
              simulation={simulation}
              selected={selected}
              onSelect={setSelected}
              trail={NO_TRAIL}
              onReset={() => go(0)}
              compact
              initialDirection={
                direction === "down" || (direction === "auto" && (anchor.current?.clientWidth ?? 1000) < 520)
                  ? "DOWN"
                  : "RIGHT"
              }
              counts={edgeCounts}
              taken={taken}
            />
          </div>
          {walkthrough.length > 0 && (
            <div
              role="group"
              aria-label="Walkthrough"
              className="flex min-h-12 shrink-0 items-center gap-1 border-t bg-background px-2 py-1.5 text-sm"
            >
              <button
                type="button"
                aria-label="Previous step"
                disabled={step === 0}
                onClick={() => {
                  setPlaying(false)
                  go(step - 1)
                }}
                className={walkButton}
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => {
                  if (!playing && step >= walkthrough.length) go(0)
                  setPlaying(!playing)
                }}
                className={walkButton}
              >
                {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
              </button>
              <button
                type="button"
                aria-label="Next step"
                disabled={step >= walkthrough.length}
                onClick={() => {
                  setPlaying(false)
                  go(step + 1)
                }}
                className={walkButton}
              >
                <ChevronRightIcon className="size-4" />
              </button>
              <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {step}/{walkthrough.length}
              </span>
              <p
                aria-live="polite"
                title={
                  current === undefined
                    ? undefined
                    : `${eventOf(current).type}${current.note ? `: ${current.note}` : ""}`
                }
                className="ml-3 line-clamp-2 min-w-0"
              >
                {current === undefined ? (
                  <span className="text-muted-foreground">Start. Press next to send the first event.</span>
                ) : (
                  <>
                    <span className="font-semibold">{eventOf(current).type}</span>
                    {current.note && <span className="text-muted-foreground">: {current.note}</span>}
                  </>
                )}
              </p>
            </div>
          )}
        </TooltipProvider>
      )}
    </div>
  )
}

const walkButton =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
