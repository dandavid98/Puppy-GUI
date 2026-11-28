import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import { isPermissionLevel, PERMISSION_INFO, PERMISSION_LEVELS, type PermissionLevel } from '@shared/permissions'
import { CHIP_ICON } from './ui/chip'
import { Select } from './ui/Select'

interface Props {
  value: PermissionLevel
  onChange: (level: PermissionLevel) => void
}

/** Colour is never the only signal: each level has its own shape too. Full access is the one worth noticing. */
const ICONS: Record<PermissionLevel, React.ReactNode> = {
  ask: <ShieldCheck size={CHIP_ICON} aria-hidden />,
  standard: <Shield size={CHIP_ICON} aria-hidden />,
  full: <ShieldAlert size={CHIP_ICON} aria-hidden className="text-danger" />,
}

/** How much Code Puppy may do in this chat without asking: a chip under the message box, beside the folder. */
export function PermissionPicker({ value, onChange }: Props) {
  const options = PERMISSION_LEVELS.map((level) => ({ value: level, label: PERMISSION_INFO[level].label, description: PERMISSION_INFO[level].description }))
  return (
    <Select
      label="Permissions"
      hint="Permissions: how much Code Puppy may do without asking"
      value={value}
      options={options}
      onChange={(next) => isPermissionLevel(next) && onChange(next)}
      placement="top"
      align="start"
      icon={ICONS[value]}
    />
  )
}
