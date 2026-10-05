import { useSyncExternalStore } from 'react'

export const themes = ['sage', 'ocean', 'dark'] as const
export type Theme = (typeof themes)[number]

// Keep this key and the valid values aligned with the pre-render script in index.html.
const preferenceKey = 'my-finance-theme'
const changeEvent = 'appearancechange'

function resolveTheme(value: string | null | undefined): Theme {
  return themes.find((theme) => theme === value) ?? 'sage'
}

function getTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme)
}

function subscribe(onChange: () => void) {
  function syncStorage(event: StorageEvent) {
    if (event.key === preferenceKey || event.key === null) {
      document.documentElement.dataset.theme = resolveTheme(event.newValue)
      onChange()
    }
  }

  window.addEventListener(changeEvent, onChange)
  window.addEventListener('storage', syncStorage)
  return () => {
    window.removeEventListener(changeEvent, onChange)
    window.removeEventListener('storage', syncStorage)
  }
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(preferenceKey, theme)
  } catch {
    // Changing appearance still works for this session if storage is unavailable.
  }
  window.dispatchEvent(new Event(changeEvent))
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'sage' as const)
}
