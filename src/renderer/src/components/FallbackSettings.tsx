import { useEffect } from 'react'
import type { ModelFallbackSettings } from '@shared/api'
import { fallbackPair } from '@shared/modelFallback'
import { modelChoices, modelName } from '../state/models'
import type { AppState } from '../state/store'
import { Select } from './ui/Select'
import { Switch } from './ui/Switch'

interface Props {
  fallback: ModelFallbackSettings
  model: AppState['model']
  /** Always the whole setting: the fields depend on each other. */
  onChange: (next: ModelFallbackSettings) => void
}

interface FieldProps {
  label: string
  hint: string
  value: string | null
  /** Every model but the one chosen for the other role: the two must differ. */
  choices: { value: string; label: string; description?: string }[]
  onChange: (value: string) => void
}

function ModelField({ label, hint, value, choices, onChange }: FieldProps) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <Select label={label} variant="field" value={value ?? ''} placeholder="Choose a model" options={choices} onChange={onChange} />
      <p className="mt-1.5 text-sm text-muted">{hint}</p>
    </div>
  )
}

/**
 * Opt-in: when the main model runs out of usage in the middle of a request, Puppy carries on
 * with the secondary one. Off until switched on, and inert until both models are chosen.
 */
export function FallbackSettings({ fallback, model, onChange }: Props) {
  const choices = model ? modelChoices(model).map((choice) => ({ value: choice.value, label: choice.name, description: choice.description })) : []
  const ready = fallbackPair(fallback)

  // The main model starts as the one in use, so turning this on leaves one thing to choose.
  // Done here, not in the switch, so it also holds when the model list arrives after the click.
  const inUse = model?.currentValue
  useEffect(() => {
    if (fallback.enabled && fallback.main === null && inUse) onChange({ ...fallback, main: inUse })
  }, [fallback, inUse]) // not onChange, which is new every render: the guard above is what makes this settle

  return (
    <div className="space-y-5">
      <Switch
        label="Switch models automatically"
        description="Off by default. When your main model runs out of usage partway through a request, Puppy carries on with your second model instead of stopping."
        checked={fallback.enabled}
        onChange={(enabled) => onChange({ ...fallback, enabled })}
      />
      {fallback.enabled &&
        (model ? (
          <div className="space-y-4">
            <ModelField
              label="Main model"
              hint="The one you normally use."
              value={fallback.main}
              choices={choices.filter((choice) => choice.value !== fallback.secondary)}
              onChange={(main) => onChange({ ...fallback, main })}
            />
            <ModelField
              label="Secondary model"
              hint="Used when the main one has run out of usage."
              value={fallback.secondary}
              choices={choices.filter((choice) => choice.value !== fallback.main)}
              onChange={(secondary) => onChange({ ...fallback, secondary })}
            />
            <p role="status" className="text-sm text-muted">
              {ready
                ? `When ${modelName(model, ready.main)} runs out of usage, Puppy will carry on with ${modelName(model, ready.secondary)}.`
                : 'Choose both models to start using this.'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading models...</p>
        ))}
    </div>
  )
}
