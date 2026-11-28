import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { isPermissionLevel, PERMISSION_INFO, PERMISSION_LEVELS, type PermissionLevel } from '@shared/permissions'
import { Select } from './ui/Select'

interface Props {
  value: PermissionLevel
  onChange: (level: PermissionLevel) => void
}

const ICON_SIZE = 14
/** In a narrow composer (beside the preview panel) the model name needs the room: only the shield is left. */
const NARROW = '@max-md:[&_button>span]:hidden @max-md:[&_button>svg:last-child]:hidden @max-md:[&_button]:px-1'
/** Colour is never the only signal: each level has its own shape too. Full access is the one worth noticing. */
const ICONS: Record<PermissionLevel, React.ReactNode> = {
  ask: <ShieldCheck size={ICON_SIZE} aria-hidden />,
  standard: <Shield size={ICON_SIZE} aria-hidden />,
  full: <ShieldAlert size={ICON_SIZE} aria-hidden className="text-danger" />,
}

/**
 * How much Code Puppy may do in this chat without asking. Sits beside the folder in the composer
 * and gives way like it: it shrinks faster than the model name (which must stay readable), and in
 * a narrow composer only the shield stays.
 */
export function PermissionPicker({ value, onChange }: Props) {
  const options = PERMISSION_LEVELS.map((level) => ({ value: level, label: PERMISSION_INFO[level].label, description: PERMISSION_INFO[level].description }))
  return (
    <span className={`inline-flex min-w-0 shrink-[3] ${NARROW}`}>
      <Select label="Permissions" value={value} options={options} onChange={(next) => isPermissionLevel(next) && onChange(next)} placement="top" align="start" icon={ICONS[value]} />
    </span>
  )
}
