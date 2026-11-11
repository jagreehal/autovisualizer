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

import { COMPACT_FIT, Canvas } from "@/canvas/Canvas"
import { layout } from "@/canvas/layout"
import { countsByEdge, takenEdges } from "@/canvas/overlay"
import { toSvg } from "@/canvas/svg"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MachineWorker } from "@/machine/client"
import { carriesCode, isString, JsonEvent } from "@/machine/json"
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
  /** Machine source, TypeScript or JavaScript. It may import xstate, effect and the xstate effect package. Wins over `definition` and `src`. */
  code?: string
  /**
   * The machine as an XState MachineJSON definition. Data, not code, so it is drawn and stepped on the page with no
   * Web Worker: it works on a page opened from disk and in sandboxed iframes. Wins over `src`. One with `@code` or
   * `@expr` runs that code, in the worker like `code`.
   */
  definition?: JsonObject
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
   * A persisted snapshot to resume exactly where it left off, from `actor.getPersistedSnapshot()`: state, context,
   * history and pending timers, with no entry actions run again. Wins over `state` and `context`.
   */
  snapshot?: JsonObject
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
  /** right, down, or auto (the default): whichever shows the chart larger in its space. */
  direction?: "auto" | "right" | "down"
}

const STEP_MS = 1800
// The height the chart fits itself to when the page sets none: tall enough to read, short enough to scroll past.
const MIN_HEIGHT = 240
const MAX_HEIGHT = 720
const { padding } = COMPACT_FIT

/** The canvas height that shows a `chart`-sized chart at full width (never above 100%), in a `width`-wide element. */
function fitHeight(chart: { readonly width: number; readonly height: number }, width: number) {
  const inset = (side: string) => Number.parseFloat(side)
  const scale = Math.min(1, (width - 2 * inset(padding.x)) / chart.width)
  return chart.height * scale + inset(padding.top) + inset(padding.bottom)
}
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

/**
 * Whether the page gives the element a height of its own. page.ts sizes it by --autoviz-fit only when the page
 * doesn't; set that to 1px for a moment and see whether the element follows. Restored before the browser paints.
 */
function pageSetsHeight(element: HTMLElement) {
  const before = element.style.getPropertyValue("--autoviz-fit")
  element.style.setProperty("--autoviz-fit", "1px")
  const followed = element.getBoundingClientRect().height <= 1
  if (before) element.style.setProperty("--autoviz-fit", before)
  else element.style.removeProperty("--autoviz-fit")
  return !followed
}

/** The walkthrough step a deep link (`#<id>/<step>`) names for chart `id`, within its `length` steps, if any. */
const linkedStep = (id: string | undefined, length: number) => {
  if (!id || !location.hash.startsWith(`#${id}/`)) return undefined
  const step = Number(location.hash.slice(id.length + 2))
  return Number.isInteger(step) ? Math.min(Math.max(step, 0), length) : undefined
}

const notAccepted = (type: string, before: SimView) =>
  `"${type}" isn't accepted in state ${before.valueJson.replace(/\s+/g, " ")}`

// WorkerError and DefinitionError are Errors too.
const errorMessage = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause))

async function sourceFrom(
  code: string | undefined,
  definition: JsonObject | undefined,
  inPage: boolean,
  src: string | undefined
): Promise<string> {
  if (code !== undefined) return code
  // The page's engine loads the definition itself; the worker gets it as code, like an imported .json file.
  if (definition !== undefined)
    return inPage
      ? JSON.stringify(definition)
      : Effect.runPromise(codeFromDefinition(JSON.stringify(definition), "definition.json"))
  if (src === undefined) throw new Error("Set the code, definition or src attribute.")
  const url = new URL(src, location.href)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${src}: ${response.status} ${response.statusText}`)
  const text = await response.text()
  if (!url.pathname.endsWith(".json")) return text
  return Effect.runPromise(codeFromDefinition(text, url.pathname.split("/").pop() ?? "machine.json"))
}

export default function Statechart({
  code,
  definition,
  src,
  machine,
  theme = "auto",
  input = NO_JSON,
  state,
  context = NO_JSON,
  snapshot,
  events,
  walkthrough = NO_STEPS,
  autoplay = false,
  counts = NO_COUNTS,
  direction = "auto"
}: StatechartProps) {
  // A definition with no code needs no worker: its engine runs on the page. Each element has its own of either, since
  // an engine holds a single simulation; a layer builds on first use, so the one this chart doesn't use costs nothing.
  const inPage = code === undefined && definition !== undefined && !carriesCode(definition)
  // A string, so the effects below compare it by value.
  const snapshotJson = snapshot === undefined ? undefined : JSON.stringify(snapshot)
  const [runtimes] = useState(() => ({
    worker: ManagedRuntime.make(MachineWorker.layer),
    page: ManagedRuntime.make(MachineWorker.inPage)
  }))
  useEffect(
    () => () => {
      void runtimes.worker.dispose()
      void runtimes.page.dispose()
    },
    [runtimes]
  )
  const runtime = inPage ? runtimes.page : runtimes.worker

  const [graph, setGraph] = useState<MachineGraph | undefined>()
  const [index, setIndex] = useState(0)
  const [sim, setSim] = useState<SimView | undefined>()
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string | undefined>()
  const [taken, setTaken] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | undefined>()
  const [properties, setProperties] = useState("")
  const anchor = useRef<HTMLDivElement>(null)
  const canvasBox = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState<{ readonly width: number; readonly height: number }>()
  const [width, setWidth] = useState(0)
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
  // One engine holds one simulation: a replay is a start and a run of sends, so two at once would interleave. Queue
  // them, and the SVG export, which replays too. `shownStep` is the step the last finished replay left showing.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const serially = useCallback(<A,>(task: () => Promise<A>) => {
    const done = queue.current.then(task)
    queue.current = done.then(
      () => undefined,
      () => undefined
    )
    return done
  }, [])
  const shownStep = useRef(0)
  // Events sent by clicking the chart since that replay: an export puts them back after it.
  const clicked = useRef<ReadonlyArray<string>>([])

  // Unqueued: only for a task already holding the queue. Everything else calls replay.
  const replayNow = useCallback(
    async (at: number, count: number, extra: ReadonlyArray<string> = []) => {
      const opening = await run(eventsFrom(events ?? ""))
      if (opening === undefined) return
      const sends = [...opening, ...walkthrough.slice(0, count).map(eventOf)]
      const start = (worker: MachineWorker["Service"]) =>
        worker.start(at, JSON.stringify(input), state, JSON.stringify(context), snapshotJson)
      let view = (await run(MachineWorker.use(start)))?.view
      const path = new Set<string>()
      for (const event of sends) {
        if (view === undefined) return
        const before = view
        view = (await run(MachineWorker.use((worker) => worker.send(JSON.stringify(event)))))?.view
        if (view !== undefined && !view.handled) {
          setError(notAccepted(event.type, before))
          return
        }
        if (view !== undefined && graphRef.current !== undefined)
          for (const id of takenEdges(graphRef.current, view.taken)) path.add(id)
      }
      // Clicked events were accepted when clicked, and transitions are pure, so they are again.
      for (const eventJson of extra) {
        if (view === undefined) return
        view = (await run(MachineWorker.use((worker) => worker.send(eventJson))))?.view
      }
      setSim(view)
      setTaken(path)
      setStep(count)
      shownStep.current = count
      clicked.current = extra
    },
    [run, input, state, context, snapshotJson, events, walkthrough]
  )
  const replay = useCallback(
    (at: number, count: number, extra: ReadonlyArray<string> = []) => serially(() => replayNow(at, count, extra)),
    [serially, replayNow]
  )

  // The custom element in the page, whose id names this chart in deep links: #<id>/<step>.
  const host = () => {
    const root = anchor.current?.getRootNode()
    return root instanceof ShadowRoot ? root.host.parentElement : null
  }
  /**
   * The space `direction="auto"` compares layouts in: the canvas's width, and its height when the page sets one. When
   * it doesn't, the element grows to fit the chart (up to MAX_HEIGHT), so that is the height to fit in.
   */
  const fitArea = useCallback(() => {
    const box = canvasBox.current
    const element = host()
    if (box === null) return { width: 0, height: 0 }
    return {
      width: box.clientWidth,
      height: element !== null && pageSetsHeight(element) ? box.clientHeight : MAX_HEIGHT
    }
  }, [])

  const go = (count: number) => {
    void replay(index, count)
    const id = host()?.id
    if (id) history.replaceState(null, "", `#${id}/${count}`)
  }

  useEffect(() => {
    let cancelled = false
    setError(undefined)
    void sourceFrom(code, definition, inPage, src)
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
        await replay(found, linkedStep(host()?.id, walkthrough.length) ?? 0)
      })
      .catch((cause: unknown) => !cancelled && setError(errorMessage(cause)))
    return () => {
      cancelled = true
    }
  }, [code, definition, inPage, src, machine, run, replay, walkthrough.length])

  /**
   * `element.toAnimatedSvg()`: the walkthrough as one self-contained SVG that steps through itself with CSS, for
   * places that can't run the element, such as a README. A docs build calls it from a headless browser. Each frame's
   * caption is the step's event and note. Afterwards the chart shows the step it showed before.
   */
  useEffect(() => {
    const element = host()
    if (element === null || graph === undefined) return
    const toAnimatedSvg = async (options: { title?: string; stepMs?: number; direction?: "right" | "down" } = {}) => {
      const opening = await Effect.runPromise(eventsFrom(events ?? ""))
      // Queued behind any replay in flight (the first one starts as the chart loads). The restore runs in the same
      // turn, so a click queued meanwhile meets the state the chart shows, not the export's last frame.
      const views = await serially(() =>
        runtime
          .runPromise(
            MachineWorker.use((worker) =>
              Effect.gen(function* () {
                const first = yield* worker.start(
                  index,
                  JSON.stringify(input),
                  state,
                  JSON.stringify(context),
                  snapshotJson
                )
                let view = first.view
                // The same check as replay: an event the machine doesn't accept fails the export.
                const send = (event: { readonly type: string }) =>
                  worker
                    .send(JSON.stringify(event))
                    .pipe(
                      Effect.flatMap(({ view: next }) =>
                        next.handled ? Effect.succeed(next) : Effect.fail(new Error(notAccepted(event.type, view)))
                      )
                    )
                for (const event of opening) view = yield* send(event)
                const shown = [view]
                for (const walk of walkthrough) {
                  view = yield* send(eventOf(walk))
                  shown.push(view)
                }
                return shown
              })
            )
          )
          .finally(() => replayNow(index, shownStep.current, clicked.current))
      )
      const captions = [
        "start",
        ...walkthrough.map((walk) => `${eventOf(walk).type}${walk.note ? `: ${walk.note}` : ""}`)
      ]
      const frames = views.map((view, i) => ({ active: view.active, caption: captions[i] ?? "" }))
      // With the root's header row, like the editor's export: toSvg draws the machine's name bar there.
      const laid = await layout(graph, options.direction === "down" ? "DOWN" : "RIGHT")
      return toSvg(laid, frames, { title: options.title ?? `${graph.id} statechart`, stepMs: options.stepMs })
    }
    Object.assign(element, { toAnimatedSvg })
    return () => void Reflect.deleteProperty(element, "toAnimatedSvg")
  }, [graph, index, runtime, serially, events, input, state, context, snapshotJson, walkthrough, replayNow])

  // A deep link followed on the page already showing the chart moves it too. go() writes the hash with
  // replaceState, which fires no hashchange, so stepping doesn't loop back here.
  useEffect(() => {
    if (graph === undefined) return
    const follow = () => {
      const linked = linkedStep(host()?.id, walkthrough.length)
      if (linked === undefined) return
      setPlaying(false)
      void replay(index, linked)
    }
    addEventListener("hashchange", follow)
    return () => removeEventListener("hashchange", follow)
  }, [graph, index, replay, walkthrough.length])

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
      // Queued like replays, so a click never lands inside an export's run of events.
      send: (eventJson) =>
        void serially(async () => {
          const result = await run(MachineWorker.use((worker) => worker.send(eventJson)))
          if (result === undefined) return
          setSim(result.view)
          if (result.view.handled) clicked.current = [...clicked.current, eventJson]
        })
    }),
    [sim, run, serially]
  )

  useEffect(() => {
    const element = anchor.current
    if (element === null) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Size the element to the chart, unless the page sets a height (page.ts reads --autoviz-fit).
  useEffect(() => {
    const element = host()
    if (element === null || chartSize === undefined || width === 0 || anchor.current === null) return
    // The walkthrough bar and anything else under the canvas.
    const below = anchor.current.clientHeight - (canvasBox.current?.clientHeight ?? 0)
    const canvas = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, fitHeight(chartSize, width)))
    element.style.setProperty("--autoviz-fit", `${Math.round(canvas + below)}px`)
  }, [chartSize, width, walkthrough.length])

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
          <div ref={canvasBox} className="relative min-h-0 flex-1">
            <Canvas
              graph={graph}
              simulation={simulation}
              selected={selected}
              onSelect={setSelected}
              trail={NO_TRAIL}
              onReset={() => go(0)}
              compact
              initialDirection={direction === "down" ? "DOWN" : direction === "right" ? "RIGHT" : "AUTO"}
              fitArea={fitArea}
              counts={edgeCounts}
              taken={taken}
              onLayout={setChartSize}
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
