import { Effect, ManagedRuntime } from "effect"
import {
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  FileCodeIcon,
  FolderOpenIcon,
  InfoIcon,
  MoonIcon,
  PanelLeftIcon,
  PlayIcon,
  SaveIcon,
  SearchIcon,
  Share2Icon,
  ShieldCheckIcon,
  SunIcon
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Canvas } from "@/canvas/Canvas"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Toaster } from "@/components/ui/sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import approvalExample from "@/examples/approval.ts?raw"
import checkoutExample from "@/examples/checkout.ts?raw"
import parallelExample from "@/examples/parallel.ts?raw"
import { cn } from "@/lib/utils"
import { MachineWorker } from "@/machine/client"
import { codeFromDefinition } from "@/machine/definition"
import { unreachableStates } from "@/machine/graph"
import { autosave, initialCode, saveFile, shareLink } from "@/storage/document"

import { CommandMenu } from "./CommandMenu"
import { Editor } from "./Editor"
import { DetailsPanel, PanelTitle, ValidationsPanel } from "./Panels"
import { Sidebar } from "./Sidebar"
import { SimulationPanel } from "./SimulationPanel"
import { useTheme } from "./theme"

import type { CommandAction } from "./CommandMenu"
import type { Simulation } from "@/canvas/Canvas"
import type { WorkerError } from "@/machine/client"
import type { MachineGraph } from "@/machine/graph"
import type { SimView } from "@/machine/simulate"

const EXAMPLES = new Map([
  ["checkout", checkoutExample],
  ["approval", approvalExample],
  ["parallel", parallelExample]
])

const BLANK = `import { createMachine } from "xstate"

export const machine = createMachine({
  id: "machine",
  initial: "idle",
  states: {
    idle: { on: { START: { target: "running" } } },
    running: { on: { STOP: { target: "idle" } } }
  }
})
`

const runtime = ManagedRuntime.make(MachineWorker.layer)

/** Run a worker call; failures become a toast and `undefined`. */
const call = <A,>(program: Effect.Effect<A, WorkerError, MachineWorker>) =>
  runtime.runPromise(
    program.pipe(
      Effect.tapError((error) => Effect.sync(() => toast.error(error.reason, { description: error.message }))),
      Effect.option,
      Effect.map((result) => (result._tag === "Some" ? result.value : undefined))
    )
  )

type RightPanel = "simulation" | "validations" | "details"

const PANELS = [
  { value: "simulation", label: "Simulation", icon: PlayIcon },
  { value: "validations", label: "Validations", icon: ShieldCheckIcon },
  { value: "details", label: "Details", icon: InfoIcon }
] as const

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" role="img" aria-label="Autovisualizer">
      <rect x="2" y="3" width="9" height="7" rx="2" className="fill-primary" />
      <rect x="13" y="14" width="9" height="7" rx="2" className="fill-foreground" />
      <path d="M6.5 10v4.5a3 3 0 0 0 3 3H13" fill="none" className="stroke-foreground" strokeWidth="2" />
    </svg>
  )
}

const countStates = (node: MachineGraph["root"]): number =>
  node.children.reduce((sum, child) => sum + 1 + countStates(child), 0)

export function App() {
  const [theme, toggleTheme] = useTheme()
  const [code, setCode] = useState(() => initialCode(checkoutExample))
  const [machines, setMachines] = useState<ReadonlyArray<MachineGraph>>([])
  const [selectedMachine, setSelectedMachine] = useState(0)
  const [selectedState, setSelectedState] = useState<string | undefined>()
  const [warning, setWarning] = useState<string | undefined>()
  const [inputJson, setInputJson] = useState("{}")
  const [sim, setSim] = useState<SimView | undefined>()
  const [log, setLog] = useState<ReadonlyArray<string>>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [codeOpen, setCodeOpen] = useState(true)
  const [panel, setPanel] = useState<RightPanel | undefined>("simulation")
  const [commandOpen, setCommandOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const start = useCallback(async (machine: number, input: string) => {
    const result = await call(MachineWorker.use((worker) => worker.start(machine, input)))
    setSim(result?.view)
    setLog([])
  }, [])

  const visualize = useCallback(
    async (source: string) => {
      autosave(source)
      const result = await call(MachineWorker.use((worker) => worker.load(source)))
      if (result === undefined) return
      setMachines(result.machines)
      setWarning(result.warning)
      setSelectedMachine(0)
      setSelectedState(undefined)
      await start(0, inputJson)
    },
    [inputJson, start]
  )

  const send = useCallback(async (eventJson: string) => {
    const result = await call(MachineWorker.use((worker) => worker.send(eventJson)))
    if (result === undefined) return
    setSim(result.view)
    setLog((entries) => [...entries, result.view.handled ? eventJson : `${eventJson} (not handled)`])
  }, [])

  /** Replace the code, with an undo toast so nothing is lost by accident. */
  const replaceCode = useCallback(
    (next: string, what: string) => {
      const previous = code
      setCode(next)
      void visualize(next)
      toast(what, {
        action: {
          label: "Undo",
          onClick: () => {
            setCode(previous)
            void visualize(previous)
          }
        }
      })
    },
    [code, visualize]
  )

  // Visualize whatever was loaded (share link, autosave or example) once, on mount.
  const loaded = useRef(false)
  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void visualize(code)
  }, [visualize, code])

  const updateCode = (next: string) => {
    setCode(next)
    autosave(next)
  }

  const graph = machines[selectedMachine]
  const simulation = useMemo<Simulation>(
    () => ({
      active: new Set(sim?.active ?? []),
      enabled: new Set(sim?.nextEvents.map((event) => event.eventJson) ?? []),
      send: (eventJson) => void send(eventJson)
    }),
    [sim, send]
  )

  const selectMachine = (index: number) => {
    setSelectedMachine(index)
    setSelectedState(undefined)
    void start(index, inputJson)
  }

  const openFile = async (file: File | undefined) => {
    if (file === undefined) return
    const text = await file.text()
    if (!file.name.endsWith(".json")) return replaceCode(text, `Opened ${file.name}`)
    // A MachineJSON definition: wrap it in machineFromJSON so it is code like any other.
    const result = await Effect.runPromise(Effect.result(codeFromDefinition(text, file.name)))
    if (result._tag === "Failure")
      return void toast.error("Not a machine definition", { description: result.failure.message })
    replaceCode(result.success, `Imported ${file.name}`)
  }
  const save = () => void saveFile(code, `${graph?.id || "machine"}.ts`, "ts")
  const exportJson = () => graph && void saveFile(graph.definitionJson, `${graph.id}.machine.json`, "json")
  const share = () => void navigator.clipboard.writeText(shareLink(code)).then(() => toast.success("Link copied"))

  // Breadcrumb: the selected state, or the deepest active one.
  const trailFor = (stateId: string) => {
    const path = graph && stateId.startsWith(`${graph.id}.`) ? stateId.slice(graph.id.length + 1) : stateId
    return path === "" ? [] : path.split(".")
  }
  const deepestActive = sim?.active.reduce(
    (deepest, id) => (id.split(".").length > deepest.split(".").length ? id : deepest),
    ""
  )
  const trail = trailFor(selectedState ?? deepestActive ?? "")

  const stats = graph && {
    states: countStates(graph.root),
    transitions: graph.edges.length,
    inferred: graph.edges.filter((edge) => edge.inferred).length,
    unreachable: unreachableStates(graph).size,
    unresolved: graph.unresolved.length
  }
  const issues = stats ? stats.unreachable + stats.unresolved : 0

  const actions: ReadonlyArray<CommandAction> = [
    { id: "visualize", group: "Actions", label: "Visualize code", shortcut: "⌘↵", run: () => void visualize(code) },
    { id: "share", group: "Actions", label: "Copy share link", run: share },
    { id: "save", group: "Actions", label: "Save code (.ts)…", run: save },
    { id: "export", group: "Actions", label: "Export MachineJSON (.json)…", run: exportJson },
    { id: "open", group: "Actions", label: "Open .ts or MachineJSON file…", run: () => fileInput.current?.click() },
    { id: "new", group: "Actions", label: "New machine", run: () => replaceCode(BLANK, "New machine") },
    {
      id: "restart",
      group: "Simulation",
      label: "Reset simulation",
      run: () => void start(selectedMachine, inputJson)
    },
    ...(sim?.nextEvents ?? []).map((event) => ({
      id: `send:${event.eventJson}`,
      group: "Simulation",
      label: `Send ${event.label}`,
      run: () => void send(event.eventJson)
    })),
    { id: "theme", group: "View", label: `Switch to ${theme === "dark" ? "light" : "dark"} theme`, run: toggleTheme },
    { id: "sidebar", group: "View", label: "Toggle sidebar", run: () => setSidebarOpen((value) => !value) },
    { id: "code", group: "View", label: "Toggle code", run: () => setCodeOpen((value) => !value) },
    ...PANELS.map((item) => ({
      id: `panel:${item.value}`,
      group: "View",
      label: `Show ${item.label}`,
      run: () => setPanel(item.value)
    })),
    ...machines.map((machine, index) => ({
      id: `machine:${index}`,
      group: "Machines",
      label: machine.id,
      run: () => selectMachine(index)
    })),
    ...[...EXAMPLES.entries()].map(([name, source]) => ({
      id: `example:${name}`,
      group: "Examples",
      label: `Load ${name}`,
      run: () => replaceCode(source, `Loaded ${name} example`)
    }))
  ]

  const iconButton = "size-8 text-muted-foreground hover:text-foreground"
  const toolbarButton = "h-8 text-[13px] text-muted-foreground"

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Toggle sidebar"
                aria-pressed={sidebarOpen}
                className={cn(iconButton, sidebarOpen && "bg-accent text-foreground")}
                onClick={() => setSidebarOpen((value) => !value)}
              >
                <PanelLeftIcon className="size-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle sidebar</TooltipContent>
          </Tooltip>
          <span className="ml-1.5 flex items-center">
            <Logo />
          </span>
          <nav aria-label="Document" className="ml-1.5 flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Local</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">{graph?.id ?? "Untitled"}</span>
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="ml-1 h-7 gap-1 bg-accent/60 px-2 text-[13px] font-medium">
                XState v6 alpha <ChevronDownIcon className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Runtime in this visualizer</DropdownMenuLabel>
              <DropdownMenuItem disabled>xstate 6.0.0-alpha.73</DropdownMenuItem>
              <DropdownMenuItem disabled>@xstate/effect 1.0.0-alpha.12</DropdownMenuItem>
              <DropdownMenuItem disabled>effect 4</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-1 flex items-center gap-1 text-[13px] text-muted-foreground">
            <CheckIcon className="size-3.5" /> Saved
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Toggle theme"
                  className={iconButton}
                  onClick={toggleTheme}
                >
                  {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? "Light" : "Dark"} theme</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="ghost" className="h-8 text-[13px]" onClick={() => fileInput.current?.click()}>
              <FolderOpenIcon /> Open
            </Button>
            <input
              ref={fileInput}
              type="file"
              aria-label="Open file"
              accept=".ts,.tsx,.js,.mjs,.json"
              className="hidden"
              onChange={(event) => {
                void openFile(event.target.files?.[0])
                event.target.value = ""
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 text-[13px]">
                  <SaveIcon /> Save <ChevronDownIcon className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={save}>
                  <FileCodeIcon /> Code
                  <span className="ml-auto text-xs text-muted-foreground">.ts</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={exportJson} disabled={graph === undefined}>
                  <BracesIcon /> XState MachineJSON
                  <span className="ml-auto text-xs text-muted-foreground">.json</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="h-8 text-[13px]" onClick={share}>
              <Share2Icon /> Share
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <Sidebar
              machines={machines}
              selected={selectedMachine}
              onSelect={selectMachine}
              examples={[...EXAMPLES.keys()]}
              onExample={(name) => replaceCode(EXAMPLES.get(name) ?? BLANK, `Loaded ${name} example`)}
              onNew={() => replaceCode(BLANK, "New machine")}
            />
          )}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={codeOpen}
                className={cn(toolbarButton, codeOpen && "bg-accent text-foreground")}
                onClick={() => setCodeOpen((value) => !value)}
              >
                <CodeXmlIcon /> Code
              </Button>
              <Button size="sm" variant="ghost" className={toolbarButton} onClick={() => void visualize(code)}>
                <PlayIcon /> Visualize <Kbd>⌘↵</Kbd>
              </Button>
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="mx-auto flex h-8 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
              >
                <SearchIcon className="size-3.5" />
                Search or run a command…
                <Kbd className="ml-auto">⌘K</Kbd>
              </button>
              {PANELS.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  size="sm"
                  variant="ghost"
                  aria-pressed={panel === value}
                  className={cn(toolbarButton, panel === value && "bg-accent text-foreground")}
                  onClick={() => setPanel((current) => (current === value ? undefined : value))}
                >
                  <Icon /> {label}
                  {value === "validations" && issues > 0 && (
                    <span className="rounded-full bg-sc-warn px-1.5 text-[10px] leading-4 font-semibold text-white dark:text-black">
                      {issues}
                    </span>
                  )}
                </Button>
              ))}
            </div>

            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              {codeOpen && (
                <>
                  <ResizablePanel id="code" defaultSize="30" minSize="18">
                    <Editor code={code} theme={theme} onChange={updateCode} onRun={() => void visualize(code)} />
                  </ResizablePanel>
                  <ResizableHandle />
                </>
              )}
              <ResizablePanel id="canvas" minSize="30">
                <div className="flex h-full flex-col">
                  <section aria-label="Statechart" className="relative min-h-0 flex-1 bg-sc-canvas">
                    {graph ? (
                      <Canvas
                        graph={graph}
                        simulation={simulation}
                        selected={selectedState}
                        onSelect={(id) => {
                          setSelectedState(id)
                          if (id !== undefined) setPanel("details")
                        }}
                        trail={trail}
                        onReset={() => void start(selectedMachine, inputJson)}
                      />
                    ) : (
                      <p className="p-6 text-sm text-muted-foreground">Write a machine and press Visualize.</p>
                    )}
                  </section>
                  {stats && (
                    <footer
                      role="status"
                      aria-label="Graph summary"
                      className="flex h-8 shrink-0 items-center gap-2 overflow-hidden border-t bg-sc-canvas px-4 font-mono text-xs whitespace-nowrap text-sc-status"
                    >
                      <span>{stats.states} states</span>·<span>{stats.transitions} transitions</span>
                      {stats.inferred > 0 && (
                        <>
                          ·<span className="text-sc-inferred">{stats.inferred} inferred</span>
                        </>
                      )}
                      {stats.unreachable > 0 && (
                        <>
                          ·<span className="text-sc-warn">{stats.unreachable} unreachable</span>
                        </>
                      )}
                      {stats.unresolved > 0 && (
                        <>
                          ·<span className="text-sc-inferred">{stats.unresolved} unresolved</span>
                        </>
                      )}
                      ·<span>machine: {graph.id}</span>
                      {sim && (
                        <>
                          ·<span className="truncate opacity-60">state: {sim.valueJson.replace(/\s+/g, " ")}</span>
                        </>
                      )}
                    </footer>
                  )}
                </div>
              </ResizablePanel>
              {panel && (
                <>
                  <ResizableHandle />
                  <ResizablePanel id="panel" defaultSize="24" minSize="16">
                    <aside
                      aria-label={PANELS.find((item) => item.value === panel)?.label}
                      className="h-full overflow-auto bg-background"
                    >
                      <PanelTitle>{PANELS.find((item) => item.value === panel)?.label}</PanelTitle>
                      {panel === "simulation" && (
                        <SimulationPanel
                          sim={sim}
                          log={log}
                          inputJson={inputJson}
                          onInputChange={setInputJson}
                          onRestart={() => void start(selectedMachine, inputJson)}
                          onSend={(eventJson) => void send(eventJson)}
                        />
                      )}
                      {panel === "validations" && <ValidationsPanel graph={graph} warning={warning} />}
                      {panel === "details" && <DetailsPanel graph={graph} stateId={selectedState} />}
                    </aside>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </main>
        </div>
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} actions={actions} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
