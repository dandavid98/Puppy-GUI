import { useSyncExternalStore } from 'react'

const query = () => window.matchMedia('(prefers-color-scheme: dark)')

function subscribe(onChange: () => void): () => void {
  const media = query()
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * Whether the app is currently dark. Main sets nativeTheme.themeSource, which
 * drives this media query, so it is right for "System" as well as forced modes.
 */
export function useDarkMode(): boolean {
  return useSyncExternalStore(subscribe, () => query().matches)
}
