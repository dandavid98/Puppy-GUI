import type { ModelFallbackSettings } from './api'

/** The models to use, or null while the feature is off, half set up, or pointless (the same model twice). */
export function fallbackPair(settings: ModelFallbackSettings): { main: string; secondary: string } | null {
  const { enabled, main, secondary } = settings
  return enabled && main && secondary && main !== secondary ? { main, secondary } : null
}
