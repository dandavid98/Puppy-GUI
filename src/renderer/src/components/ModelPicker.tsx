import { Sparkles } from 'lucide-react'
import type { QuotaSnapshot } from '@shared/api'
import type { AppState } from '../state/store'
import { ModelQuotaRing } from './ModelQuotaRing'
import { QuotaSummary } from './QuotaSummary'
import { Select } from './ui/Select'

interface Props {
  model: AppState['model']
  value: string | undefined
  onChange: (value: string) => void
  placement?: 'top' | 'bottom'
  variant?: 'quiet' | 'field'
  /** The user's real quota: undefined while loading, null when it cannot be read. */
  quota?: QuotaSnapshot | null
  /** The menu was opened: a good moment to refresh the quota. */
  onOpen?: () => void
}

export function ModelPicker({ model, value, onChange, placement = 'top', variant = 'quiet', quota, onOpen }: Props) {
  if (!model) return null
  const options = model.options
    .flatMap((entry) => ('options' in entry ? entry.options : [entry]))
    .map((option) => ({
      value: option.value,
      label: option.name,
      description: option.description ?? undefined,
      trailing: quota ? <ModelQuotaRing quota={quota} model={option.value} name={option.name} /> : undefined,
    }))
  const footer =
    quota === undefined ? undefined : quota ? (
      <QuotaSummary quota={quota} />
    ) : (
      <span data-testid="quota-summary">Quota unavailable right now (check your network or VPN)</span>
    )
  return (
    <Select
      label="Model"
      value={value ?? model.currentValue}
      options={options}
      onChange={onChange}
      onOpen={onOpen}
      footer={footer}
      placement={placement}
      align={variant === 'field' ? 'start' : 'end'}
      variant={variant}
      icon={variant === 'quiet' ? <Sparkles size={14} aria-hidden /> : undefined}
    />
  )
}
