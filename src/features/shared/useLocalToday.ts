import { useEffect, useState } from 'react'
import { localCalendarDate } from '../transactions/transactionHelpers'

/** Refresh date-only presentation after midnight or returning to the app. */
export function useLocalToday() {
  const [today, setToday] = useState(() => localCalendarDate())
  useEffect(() => {
    const update = () => setToday(localCalendarDate())
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return today
}
