import {
  ArrowUpDownIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileCodeIcon,
  FolderIcon,
  HardDriveIcon,
  PlusIcon,
  SearchIcon
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import type { MachineGraph } from "@/machine/graph"

export interface SidebarProps {
  readonly machines: ReadonlyArray<MachineGraph>
  readonly selected: number
  readonly onSelect: (index: number) => void
  readonly examples: ReadonlyArray<string>
  readonly onExample: (name: string) => void
  readonly onNew: () => void
}

const countStates = (machine: MachineGraph) => {
  const walk = (node: MachineGraph["root"]): number => 1 + node.children.reduce((sum, child) => sum + walk(child), 0)
  return walk(machine.root) - 1
}

interface FolderProps {
  readonly icon: React.ReactNode
  readonly title: string
  readonly hint?: string
  readonly children: React.ReactNode
}

function Folder({ icon, title, hint, children }: FolderProps) {
  const [open, setOpen] = useState(true)
  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-semibold hover:bg-accent"
      >
        <span className="text-muted-foreground">{icon}</span>
        {title}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-px">{children}</div>}
    </div>
  )
}

interface ItemProps {
  readonly label: string
  readonly meta?: string
  readonly active?: boolean
  readonly onClick: () => void
}

function Item({ label, meta, active, onClick }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md pr-2 pl-3 text-left text-sm text-foreground/90 hover:bg-accent",
        active && "bg-accent text-foreground"
      )}
    >
      <ChevronRightIcon className="size-3.5 text-muted-foreground" />
      <span className="truncate">{label}</span>
      {meta && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </button>
  )
}

export function Sidebar({ machines, selected, onSelect, examples, onExample, onNew }: SidebarProps) {
  const [filter, setFilter] = useState("")
  const [sorted, setSorted] = useState(false)
  const match = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase())
  const order = <T,>(items: ReadonlyArray<T>, name: (item: T) => string) =>
    sorted ? [...items].sort((a, b) => name(a).localeCompare(name(b))) : items

  return (
    <aside aria-label="Machines" className="flex h-full w-[288px] shrink-0 flex-col border-r bg-background">
      <div className="flex h-11 items-center border-b px-2">
        <div className="flex w-full">
          <Button size="sm" className="h-8 flex-1 rounded-r-none" onClick={onNew}>
            <PlusIcon /> New machine…
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                aria-label="New from example"
                className="h-8 rounded-l-none border-l border-primary-foreground/20 px-2"
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Start from</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onNew}>Blank machine</DropdownMenuItem>
              <DropdownMenuSeparator />
              {examples.map((name) => (
                <DropdownMenuItem key={name} onSelect={() => onExample(name)}>
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex gap-1.5 p-2">
        <label className="flex h-8 flex-1 items-center gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring/50">
          <SearchIcon className="size-3.5 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter machines…"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Button
          size="icon"
          variant="outline"
          aria-label="Sort by name"
          aria-pressed={sorted}
          className={cn("size-8", sorted && "bg-accent")}
          onClick={() => setSorted((value) => !value)}
        >
          <ArrowUpDownIcon className="size-3.5" />
        </Button>
      </div>
      <nav className="flex-1 overflow-auto px-2">
        <Folder icon={<FileCodeIcon className="size-4" />} title="This file" hint={`${machines.length}`}>
          {machines.length === 0 && <p className="px-3 py-1 text-sm text-muted-foreground">No machines yet.</p>}
          {order(
            machines.map((machine, index) => ({ machine, index })),
            (item) => item.machine.id
          )
            .filter((item) => match(item.machine.id))
            .map(({ machine, index }) => (
              <Item
                key={`${index}:${machine.id}`}
                label={machine.id}
                meta={`${countStates(machine)} states`}
                active={index === selected}
                onClick={() => onSelect(index)}
              />
            ))}
        </Folder>
        <Folder icon={<BookOpenIcon className="size-4" />} title="Examples">
          {order(examples, (name) => name)
            .filter(match)
            .map((name) => (
              <Item key={name} label={name} onClick={() => onExample(name)} />
            ))}
        </Folder>
        <Folder icon={<FolderIcon className="size-4" />} title="Saved" hint="coming with accounts">
          <p className="px-3 py-1 text-xs leading-relaxed text-muted-foreground">
            Use Save to keep a <code>.ts</code> file on your machine, or Share for a link.
          </p>
        </Folder>
      </nav>
      <div className="flex h-14 items-center gap-2.5 border-t px-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-muted-foreground">
          <HardDriveIcon className="size-4" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">Local workspace</span>
          <span className="text-xs text-muted-foreground">Saved in this browser</span>
        </div>
      </div>
    </aside>
  )
}
