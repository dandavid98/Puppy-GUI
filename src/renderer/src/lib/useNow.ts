import { useEffect, useState } from 'react'

/** The current time (ms), re-read every `intervalMs` so countdowns on screen keep moving. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
