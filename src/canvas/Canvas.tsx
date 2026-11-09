import {
  Background,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  useStore
} from "@xyflow/react"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  HandIcon,
  LockIcon,
  LockOpenIcon,
  MaximizeIcon,
  MousePointer2Icon,
  PlayIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  WorkflowIcon
} from "lucide-react"
import { createContext, use, useEffect, useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { SIZE, layout } from "./layout"

import type { Direction, Laidout, Point, StateFlowNode, TransitionFlowEdge } from "./layout"
import type { MachineGraph, StateGraphEdge } from "@/machine/graph"
import type { EdgeProps, NodeProps } from "@xyflow/react"

export type Tool = "select" | "pan" | "simulate"

export interface Simulation {
  /** Active state ids; empty when no simulation is running. */
  readonly active: ReadonlySet<string>
  /** JSON of every event the active states accept right now. */
  readonly enabled: ReadonlySet<string>
  readonly send: (eventJson: string) => void
}

interface CanvasState extends Simulation {
  readonly tool: Tool
  readonly selected: string | undefined
}

const CanvasContext = createContext<CanvasState>({
  active: new Set(),
  enabled: new Set(),
  send: () => {},
  tool: "simulate",
  selected: undefined
})

interface FlagProps {
  readonly tone: "warn" | "inferred"
  readonly icon: React.ReactNode
  readonly tip: string
}

/** Small corner badge for states that need attention. */
function Flag({ tone, icon, tip }: FlagProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tip}
          className={cn(
            "absolute -top-2.5 -right-2.5 z-10 flex size-[18px] items-center justify-center rounded-full text-white ring-2 ring-sc-canvas dark:text-black",
            tone === "warn" ? "bg-sc-warn" : "bg-sc-inferred"
          )}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

/** The dot-and-arrow that marks a parent's initial state. */
function InitialMarker() {
  return (
    <svg
      aria-label="initial state"
      className="absolute -top-[13px] -left-[22px] text-sc-edge"
      width="24"
      height="26"
      viewBox="0 0 24 26"
    >
      <circle cx="4" cy="4" r="3.5" fill="currentColor" />
      <path d="M4 8 C4 17 8 20 15 20" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 16 L20 20 L14 24 z" fill="currentColor" />
    </svg>
  )
}

function Chips({ invokes }: { readonly invokes: ReadonlyArray<string> }) {
  if (invokes.length === 0) return null
  return (
    <div className="flex flex-col items-start gap-1.5">
      {invokes.map((src) => (
        <span
          key={src}
          className="flex h-[22px] items-center gap-1 rounded-[5px] border border-sc-node-border/50 bg-sc-canvas/60 px-1.5 font-mono text-[11px] text-sc-node-fg/80"
        >
          <WorkflowIcon className="size-3 opacity-70" />
          <span className="opacity-60">invoke</span> {src}
        </span>
      ))}
    </div>
  )
}

const tag =
  "shrink-0 rounded-[4px] bg-sc-node px-1.5 py-px text-[10px] font-medium tracking-wide text-sc-node-fg/70 uppercase"

function StateNodeView({ data }: NodeProps<StateFlowNode>) {
  const { state, machineId, isRoot, isInitial, isRegion, isUnreachable, hasUnresolved } = data
  const { active, selected } = use(CanvasContext)
  const isActive = active.has(state.id)
  const isSelected = selected === state.id
  const isParent = state.children.length > 0
  const decorations = (
    <>
      <Handle type="target" position={Position.Left} className="!invisible" />
      <Handle type="source" position={Position.Right} className="!invisible" />
      {isInitial && <InitialMarker />}
      {isUnreachable && (
        <Flag
          tone="warn"
          icon={<TriangleAlertIcon className="size-2.5" strokeWidth={3} />}
          tip="Unreachable: nothing transitions here."
        />
      )}
      {hasUnresolved && (
        <Flag
          tone="inferred"
          icon={<CircleHelpIcon className="size-3" strokeWidth={2.5} />}
          tip="A transition function here computes its target; the graph can't show where it goes."
        />
      )}
    </>
  )
  const ring = isSelected && "ring-2 ring-sc-active ring-offset-2 ring-offset-sc-canvas"

  if (isParent) {
    return (
      <div
        role="group"
        aria-label={state.key || machineId}
        aria-current={isActive || undefined}
        className={cn(
          "relative h-full w-full rounded-[8px] border-[1.5px] border-sc-node-border",
          isRoot ? "bg-transparent" : "bg-sc-parent/70",
          isRegion && "border-dashed",
          isActive && !isRoot && "border-sc-active",
          ring
        )}
      >
        {decorations}
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-1.5 border-b-[1.5px] border-sc-node-border px-3 text-sc-node-fg",
            isRegion && "border-dashed",
            isActive && !isRoot && "border-sc-active"
          )}
          style={{ height: SIZE.headerHeight }}
        >
          <ChevronDownIcon className="size-4 opacity-60" />
          <span className="truncate text-[14px] font-semibold">{state.key || machineId}</span>
          {isRoot && <span className={tag}>machine</span>}
          {state.kind === "parallel" && <span className={tag}>parallel</span>}
        </div>
        {state.invokes.length > 0 && (
          <div className="px-3 pt-2">
            <Chips invokes={state.invokes} />
          </div>
        )}
      </div>
    )
  }

  const tone = isUnreachable
    ? "border-sc-warn-border bg-sc-warn-fill text-sc-node-fg"
    : state.kind === "final"
      ? "border-sc-final-border bg-sc-final-fill text-sc-final-fg"
      : "border-sc-node-border bg-sc-node text-sc-node-fg"
  return (
    <div
      role="group"
      aria-label={state.key}
      aria-current={isActive || undefined}
      className={cn(
        "relative flex h-full w-full flex-col justify-center gap-1 rounded-[6px] border-[1.5px] transition-[box-shadow,background-color,border-color] duration-200",
        tone,
        isActive && "border-sc-active bg-sc-active-fill shadow-[0_0_0_4px_var(--sc-active-halo)]",
        ring
      )}
      style={{ paddingInline: SIZE.leafPadX }}
    >
      {decorations}
      <div className="flex items-center gap-2" style={{ height: state.invokes.length > 0 ? 26 : undefined }}>
        {state.kind === "final" && <CircleDotIcon className="size-[18px] shrink-0" strokeWidth={2.5} />}
        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{state.key}</span>
      </div>
      <Chips invokes={state.invokes} />
    </div>
  )
}

/** An orthogonal polyline with rounded corners. */
function roundedPath(points: ReadonlyArray<Point>, radius = 8): string {
  const [first, ...rest] = points
  if (first === undefined) return ""
  let d = `M ${first.x} ${first.y}`
  rest.forEach((point, i) => {
    const prev = points[i]
    const next = rest[i + 1]
    if (prev === undefined || next === undefined) {
      d += ` L ${point.x} ${point.y}`
      return
    }
    const inLen = Math.hypot(point.x - prev.x, point.y - prev.y)
    const outLen = Math.hypot(next.x - point.x, next.y - point.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const before = { x: point.x - ((point.x - prev.x) / inLen) * r, y: point.y - ((point.y - prev.y) / inLen) * r }
    const after = { x: point.x + ((next.x - point.x) / outLen) * r, y: point.y + ((next.y - point.y) / outLen) * r }
    d += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`
  })
  return d
}

const KIND_ICON = { after: ClockIcon, done: CircleCheckIcon, error: CircleXIcon } as const

function PillIcon({ edge }: { readonly edge: StateGraphEdge }) {
  if (edge.branch !== undefined) {
    return (
      <span className="relative flex size-4 items-center justify-center">
        <span className="absolute inset-[2px] rotate-45 rounded-[2px] bg-current" />
        <span className="relative text-[9px] font-bold text-sc-pill">{edge.branch}</span>
      </span>
    )
  }
  if (edge.kind === "after" || edge.kind === "done" || edge.kind === "error") {
    const Icon = KIND_ICON[edge.kind]
    return <Icon className="size-3 opacity-70" strokeWidth={2.5} />
  }
  return null
}

function TransitionEdgeView({ id, data }: EdgeProps<TransitionFlowEdge>) {
  const { active, enabled, send, tool } = use(CanvasContext)
  if (data === undefined) return null
  const { edge, points, label } = data
  const live = active.has(edge.source)
  const canSend = tool === "simulate" && live && edge.eventJson !== undefined && enabled.has(edge.eventJson)
  return (
    <>
      <BaseEdge
        id={id}
        path={roundedPath(points)}
        markerEnd={live ? "url(#sc-arrow-active)" : "url(#sc-arrow)"}
        style={{
          stroke: live ? "var(--sc-active)" : "var(--sc-edge)",
          strokeWidth: 1.5,
          strokeDasharray: edge.inferred ? "5 4" : undefined
        }}
      />
      <EdgeLabelRenderer>
        {/* No press-scale: `scale` would also scale the translate below and move the pill
            out from under the pointer between mousedown and mouseup. */}
        <button
          type="button"
          disabled={!canSend}
          aria-label={edge.branch === undefined ? edge.label : `${edge.label} (branch ${edge.branch})`}
          onClick={() => edge.eventJson !== undefined && send(edge.eventJson)}
          title={edge.inferred ? "Target read from a transition function" : edge.eventJson}
          className={cn(
            "nodrag nopan pointer-events-auto absolute flex items-center justify-center gap-1.5 rounded-full border-[1.5px] font-semibold whitespace-nowrap",
            "border-sc-node-border bg-sc-pill text-[11px] text-sc-pill-fg",
            edge.kind === "always" && "italic",
            edge.inferred && "border-dashed",
            live && "border-sc-active text-sc-active",
            canSend &&
              "cursor-pointer bg-sc-active-fill transition-[box-shadow,filter] hover:shadow-[0_0_0_3px_var(--sc-active-halo)] active:brightness-95"
          )}
          style={{
            transform: `translate(${label.x}px, ${label.y}px)`,
            width: label.width,
            height: SIZE.pillHeight,
            paddingInline: SIZE.pillPadX
          }}
        >
          <PillIcon edge={edge} />
          {edge.label}
        </button>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { state: StateNodeView }
const edgeTypes = { transition: TransitionEdgeView }

function ArrowMarkers() {
  const marker = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill={color} />
    </marker>
  )
  return (
    <svg className="absolute size-0">
      <defs>
        {marker("sc-arrow", "var(--sc-edge)")}
        {marker("sc-arrow-active", "var(--sc-active)")}
      </defs>
    </svg>
  )
}

const chrome = "flex items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur"
const iconButton =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"

interface ZoomControlsProps {
  readonly locked: boolean
  readonly onLock: () => void
}

function ZoomControls({ locked, onLock }: ZoomControlsProps) {
  const flow = useReactFlow()
  const zoom = useStore((store) => store.transform[2])
  return (
    <div className={cn(chrome, "gap-0.5 p-1")}>
      <button
        type="button"
        aria-label="Reset zoom to 100%"
        className="h-8 min-w-14 rounded-md px-2 text-sm font-medium tabular-nums hover:bg-accent"
        onClick={() => void flow.zoomTo(1, { duration: 200 })}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Fit to screen"
        className={iconButton}
        onClick={() => void flow.fitView({ duration: 250, padding: 0.15, maxZoom: 1.1 })}
      >
        <MaximizeIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label={locked ? "Unlock canvas" : "Lock canvas"}
        className={iconButton}
        onClick={onLock}
      >
        {locked ? <LockIcon className="size-4" /> : <LockOpenIcon className="size-4" />}
      </button>
    </div>
  )
}

const TOOLS = [
  { value: "select", label: "Inspect states", icon: MousePointer2Icon },
  { value: "pan", label: "Pan", icon: HandIcon },
  { value: "simulate", label: "Simulate: click events to send them", icon: PlayIcon }
] as const

interface ToolsProps {
  readonly tool: Tool
  readonly onTool: (tool: Tool) => void
  readonly onReset: () => void
}

function Tools({ tool, onTool, onReset }: ToolsProps) {
  return (
    <div className={cn(chrome, "gap-0.5 p-1")}>
      {TOOLS.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-pressed={tool === value}
              onClick={() => onTool(value)}
              className={cn(
                iconButton,
                "size-9",
                tool === value && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              <Icon className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Reset simulation" onClick={onReset} className={cn(iconButton, "size-9")}>
            <RotateCcwIcon className="size-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Reset simulation</TooltipContent>
      </Tooltip>
    </div>
  )
}

interface SettingsProps {
  readonly direction: Direction
  readonly onDirection: (direction: Direction) => void
}

function Settings({ direction, onDirection }: SettingsProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Canvas settings" className={cn(chrome, iconButton, "size-10")}>
          <SlidersHorizontalIcon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Layout direction</p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={direction}
          onValueChange={(value) => (value === "RIGHT" || value === "DOWN") && onDirection(value)}
          className="w-full"
        >
          <ToggleGroupItem value="RIGHT" className="flex-1">
            Left to right
          </ToggleGroupItem>
          <ToggleGroupItem value="DOWN" className="flex-1">
            Top to bottom
          </ToggleGroupItem>
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  )
}

export interface CanvasProps {
  readonly graph: MachineGraph
  readonly simulation: Simulation
  readonly selected: string | undefined
  readonly onSelect: (stateId: string | undefined) => void
  /** Breadcrumb trail after the machine: the selected or deepest active state. */
  readonly trail: ReadonlyArray<string>
  readonly onReset: () => void
}

export function Canvas({ graph, simulation, selected, onSelect, trail, onReset }: CanvasProps) {
  const [direction, setDirection] = useState<Direction>("RIGHT")
  const [tool, setTool] = useState<Tool>("simulate")
  const [locked, setLocked] = useState(false)
  const [laidout, setLaidout] = useState<Laidout | undefined>()

  useEffect(() => {
    let cancelled = false
    void layout(graph, direction).then((result) => {
      if (!cancelled) setLaidout(result)
    })
    return () => {
      cancelled = true
    }
  }, [graph, direction])

  if (laidout === undefined) return <div className="h-full bg-sc-canvas" />
  return (
    <CanvasContext value={{ ...simulation, tool, selected }}>
      <ArrowMarkers />
      <ReactFlow
        key={`${graph.id}:${direction}`}
        nodes={[...laidout.nodes]}
        edges={[...laidout.edges]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        panOnDrag={!locked && tool !== "select"}
        panOnScroll={!locked}
        zoomOnScroll={false}
        zoomOnPinch={!locked}
        zoomOnDoubleClick={false}
        onNodeClick={(_, node) => onSelect(node.data.state.id)}
        onPaneClick={() => onSelect(undefined)}
        className={cn(tool === "pan" && "[&_.react-flow__pane]:cursor-grab")}
      >
        <Background variant={BackgroundVariant.Lines} gap={24} lineWidth={1} />
        <Panel position="top-left" className="!m-3">
          <nav aria-label="Breadcrumb" className={cn(chrome, "h-9 gap-1 px-3 text-sm")}>
            <span className="text-muted-foreground">root</span>
            {[graph.id, ...trail].map((part, i, all) => (
              <span key={`${i}:${part}`} className="flex items-center gap-1">
                <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                <span className={cn(i === all.length - 1 ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {part}
                </span>
              </span>
            ))}
          </nav>
        </Panel>
        <Panel position="bottom-left" className="!m-3">
          <ZoomControls locked={locked} onLock={() => setLocked((value) => !value)} />
        </Panel>
        <Panel position="bottom-center" className="!m-3">
          <Tools tool={tool} onTool={setTool} onReset={onReset} />
        </Panel>
        <Panel position="bottom-right" className="!m-3">
          <Settings direction={direction} onDirection={setDirection} />
        </Panel>
      </ReactFlow>
    </CanvasContext>
  )
}
