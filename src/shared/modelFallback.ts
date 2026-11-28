import type { ModelFallbackSettings } from './api'

/** The models to use, or null while the feature is off, half set up, or pointless (the same model twice). */
export function fallbackPair(settings: ModelFallbackSettings): { main: string; secondary: string } | null {
  const { enabled, main, secondary } = settings
  return enabled && main && secondary && main !== secondary ? { main, secondary } : null
}

/** The main model is the default one, that new chats start on: choosing it keeps the two models different. */
export function withMain(settings: ModelFallbackSettings, main: string): ModelFallbackSettings {
  return { ...settings, main, secondary: settings.secondary === main ? null : settings.secondary }
}

/**
 * What a chat's change of model does to automatic switching in it. A chat the user puts on a model
 * that is neither of the two has it off (it only ever switches from the main model); back on one of
 * them, it is on again. Null when nothing changes, or switching is not set up at all.
 */
export function switchingChange(settings: ModelFallbackSettings, before: string | null, after: string | null): 'off' | 'on' | null {
  const pair = fallbackPair(settings)
  if (!pair) return null
  const outside = (model: string | null) => model !== null && model !== pair.main && model !== pair.secondary
  if (!outside(before) && outside(after)) return 'off'
  if (outside(before) && !outside(after)) return 'on'
  return null
}
