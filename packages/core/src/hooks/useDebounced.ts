import { useEffect, useState } from 'react'

/**
 * Trails `value` by `delay`, so a search box can drive a query without firing
 * one request per keystroke. The timer resets on every change, so the query
 * only runs once typing pauses.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
