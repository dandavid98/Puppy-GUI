import type { AvailableCommand } from '@agentclientprotocol/sdk'
import { SquareSlash } from 'lucide-react'
import { POPOVER } from './ui/popover'

interface Props {
  id: string
  commands: AvailableCommand[]
  active: number
  onHover: (index: number) => void
  onPick: (command: AvailableCommand) => void
}

export const commandOptionId = (listId: string, index: number) => `${listId}-${index}`

/** The "/" suggestions above the composer. Keyboard handling lives in Composer. */
export function SlashMenu({ id, commands, active, onHover, onPick }: Props) {
  return (
    <ul id={id} role="listbox" aria-label="Commands" className={`${POPOVER} bottom-full left-0 mb-2 w-full max-w-md`}>
      {commands.map((command, index) => (
        <li
          key={command.name}
          id={commandOptionId(id, index)}
          role="option"
          aria-selected={index === active}
          onPointerMove={() => onHover(index)}
          onPointerDown={(event) => {
            event.preventDefault() // keep focus in the textarea
            onPick(command)
          }}
          className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm ${index === active ? 'bg-raised' : ''}`}
        >
          <SquareSlash size={15} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block font-mono">/{command.name}</span>
            <span className="block truncate text-xs text-muted">{command.description}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
