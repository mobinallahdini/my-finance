import { useEffect } from 'react'

const dataChanges = new EventTarget()

/** Notify mounted features only after a repository write has succeeded. */
export function notifyDataChanged() {
  dataChanges.dispatchEvent(new Event('change'))
}

/** Subscribe with a stable callback; each feature rereads its own repositories. */
export function useDataRefresh(reload: () => void) {
  useEffect(() => {
    dataChanges.addEventListener('change', reload)
    return () => dataChanges.removeEventListener('change', reload)
  }, [reload])
}
