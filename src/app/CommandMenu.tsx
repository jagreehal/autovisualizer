import { useEffect } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command"

export interface CommandAction {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly shortcut?: string
  readonly run: () => void
}

export interface CommandMenuProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly actions: ReadonlyArray<CommandAction>
}

export function CommandMenu({ open, onOpenChange, actions }: CommandMenuProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const groups = [...new Set(actions.map((action) => action.group))]
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command menu" description="Search or run a command">
      <CommandInput placeholder="Search or run a command…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {actions
              .filter((action) => action.group === group)
              .map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${group} ${action.label}`}
                  onSelect={() => {
                    onOpenChange(false)
                    action.run()
                  }}
                >
                  {action.label}
                  {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
