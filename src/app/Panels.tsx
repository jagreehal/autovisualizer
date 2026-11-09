import { ArrowRightIcon, CircleCheckIcon, CircleHelpIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { unreachableStates } from "@/machine/graph"

import type { MachineGraph, StateGraphNode } from "@/machine/graph"

export function PanelTitle({ children }: { readonly children: React.ReactNode }) {
  return <h2 className="px-4 pt-4 pb-2 text-[15px] font-semibold">{children}</h2>
}

interface IssueProps {
  readonly tone: "warn" | "inferred" | "info"
  readonly title: string
  readonly children: React.ReactNode
}

function Issue({ tone, title, children }: IssueProps) {
  const Icon = tone === "warn" ? TriangleAlertIcon : tone === "inferred" ? CircleHelpIcon : InfoIcon
  return (
    <li className="flex gap-2.5 rounded-lg border bg-card p-3">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-sc-warn" : tone === "inferred" ? "text-sc-inferred" : "text-muted-foreground"
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{children}</span>
      </div>
    </li>
  )
}

const shortId = (id: string, machineId: string) =>
  (id.startsWith(`${machineId}.`) ? id.slice(machineId.length + 1) : id) || "(root)"

export interface ValidationsPanelProps {
  readonly graph: MachineGraph | undefined
  readonly warning: string | undefined
}

export function ValidationsPanel({ graph, warning }: ValidationsPanelProps) {
  if (graph === undefined) return <p className="px-4 text-sm text-muted-foreground">No machine loaded.</p>
  const unreachable = [...unreachableStates(graph)]
  const inferred = graph.edges.filter((edge) => edge.inferred).length
  const clean = !warning && unreachable.length === 0 && graph.unresolved.length === 0
  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {clean && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheckIcon className="size-4 text-sc-final-border" /> No issues found.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {warning && (
          <Issue tone="info" title="Top-level code">
            {warning}
          </Issue>
        )}
        {unreachable.map((id) => (
          <Issue key={id} tone="warn" title={`${shortId(id, graph.id)} is unreachable`}>
            No transition targets this state and it is not an initial state.
          </Issue>
        ))}
        {graph.unresolved.map((u, i) => (
          <Issue
            key={`${u.source}:${u.label}:${i}`}
            tone="inferred"
            title={`${shortId(u.source, graph.id)} · ${u.label}`}
          >
            This transition function computes its target, so the graph can't show where it goes. Return a literal{" "}
            <code>{"{ target: '…' }"}</code> per branch to make the edge visible.
          </Issue>
        ))}
      </ul>
      {inferred > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {inferred} dashed edge{inferred === 1 ? "" : "s"} come from literal targets inside transition functions.
          Numbered diamonds mark branches of the same function.
        </p>
      )}
    </div>
  )
}

function find(node: StateGraphNode, id: string): StateGraphNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = find(child, id)
    if (found) return found
  }
  return undefined
}

interface RowProps {
  readonly label: string
  readonly children: React.ReactNode
}

function Row({ label, children }: RowProps) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

export interface DetailsPanelProps {
  readonly graph: MachineGraph | undefined
  readonly stateId: string | undefined
}

export function DetailsPanel({ graph, stateId }: DetailsPanelProps) {
  const state = graph && stateId !== undefined ? find(graph.root, stateId) : undefined
  if (graph === undefined || state === undefined) {
    return <p className="px-4 text-sm text-muted-foreground">Click a state on the canvas to see its details.</p>
  }
  const out = graph.edges.filter((edge) => edge.source === state.id)
  const into = graph.edges.filter((edge) => edge.target === state.id && edge.source !== state.id)
  const name = (id: string) => shortId(id, graph.id)
  return (
    <div className="px-4 pb-4">
      <dl className="divide-y">
        <Row label="State">
          <span className="font-semibold">{state.key || graph.id}</span>
        </Row>
        <Row label="Id">
          <code className="font-mono text-xs">{state.id || "(root)"}</code>
        </Row>
        <Row label="Type">{state.kind}</Row>
        {state.initial && <Row label="Initial">{name(state.initial)}</Row>}
        {state.invokes.length > 0 && <Row label="Invokes">{state.invokes.join(", ")}</Row>}
        {state.tags.length > 0 && <Row label="Tags">{state.tags.join(", ")}</Row>}
        {state.description && <Row label="Description">{state.description}</Row>}
      </dl>
      <h3 className="mt-4 mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Transitions out</h3>
      {out.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {out.map((edge) => (
            <li key={edge.id} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "rounded-full border-[1.5px] border-sc-node-border px-2 text-[11px] font-semibold",
                  edge.inferred && "border-dashed"
                )}
              >
                {edge.label}
              </span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              {name(edge.target)}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-4 mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Transitions in</h3>
      {into.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {into.map((edge) => (
            <li key={edge.id} className="text-sm">
              {name(edge.source)} <span className="text-muted-foreground">on</span> {edge.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
