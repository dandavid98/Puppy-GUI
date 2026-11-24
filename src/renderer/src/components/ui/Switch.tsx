interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

/** On/off control (role="switch"), with its label and description wired for screen readers. */
export function Switch({ checked, onChange, label, description }: Props) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-raised ring-1 ring-line ring-inset'}`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
  )
}
