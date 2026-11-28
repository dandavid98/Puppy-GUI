import type { AppState } from './store'

export interface ModelChoice {
  value: string
  name: string
  description?: string
}

/** The models Code Puppy offers, flat: its list may group them. */
export function modelChoices(model: NonNullable<AppState['model']>): ModelChoice[] {
  return model.options
    .flatMap((entry) => ('options' in entry ? entry.options : [entry]))
    .map((option) => ({ value: option.value, name: option.name, description: option.description ?? undefined }))
}

/** A model as the user knows it (the name in the list), falling back to its id. */
export function modelName(model: AppState['model'], value: string): string {
  return (model ? modelChoices(model).find((choice) => choice.value === value)?.name : undefined) ?? value
}
