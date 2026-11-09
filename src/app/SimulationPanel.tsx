import { RotateCcwIcon, SendIcon } from "lucide-react"
import { useId, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import type { SimView } from "@/machine/simulate"

export interface SimulationPanelProps {
  readonly sim: SimView | undefined
  readonly log: ReadonlyArray<string>
  readonly inputJson: string
  readonly onInputChange: (inputJson: string) => void
  readonly onRestart: () => void
  readonly onSend: (eventJson: string) => void
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1.5 py-2">
      <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

const Json = ({ text }: { readonly text: string }) => (
  <pre className="overflow-auto rounded-md bg-muted/40 p-2 font-mono text-xs">{text}</pre>
)

export function SimulationPanel({ sim, log, inputJson, onInputChange, onRestart, onSend }: SimulationPanelProps) {
  const [custom, setCustom] = useState('{ "type": "" }')
  if (sim === undefined)
    return <p className="px-4 py-2 text-sm text-muted-foreground">Visualize a machine to simulate it.</p>
  return (
    <div className="flex flex-col divide-y px-4">
      <Section title="Status">
        <div className="flex items-center gap-2">
          <Badge variant={sim.status === "active" ? "default" : "secondary"}>{sim.status}</Badge>
          {!sim.handled && <Badge variant="outline">last event not handled</Badge>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onRestart}>
            <RotateCcwIcon /> Reset
          </Button>
        </div>
      </Section>
      <Section title="Send an event">
        <div className="flex flex-wrap gap-1.5">
          {sim.nextEvents.length === 0 && <span className="text-sm text-muted-foreground">No events accepted.</span>}
          {sim.nextEvents.map((event) => (
            <Button
              key={event.eventJson}
              size="sm"
              variant="secondary"
              title={event.eventJson}
              onClick={() => onSend(event.eventJson)}
            >
              {event.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing runs: invoked actors and timers wait until you send their events. Add a payload (e.g.{" "}
          <code>output</code>) with a custom event.
        </p>
        <div className="flex gap-2">
          <Textarea
            aria-label="Custom event JSON"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="min-h-9 font-mono text-xs"
          />
          <Button size="sm" variant="secondary" onClick={() => onSend(custom)}>
            <SendIcon /> Send
          </Button>
        </div>
      </Section>
      <Section title="Value">
        <Json text={sim.valueJson} />
      </Section>
      <Section title="Context">
        <Json text={sim.contextJson} />
      </Section>
      <Section title="Input (applies on restart)">
        <Textarea
          aria-label="Machine input JSON"
          value={inputJson}
          onChange={(event) => onInputChange(event.target.value)}
          className="font-mono text-xs"
        />
      </Section>
      <Section title="Events sent">
        {log.length === 0 ? (
          <span className="text-sm text-muted-foreground">None yet.</span>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-xs">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
