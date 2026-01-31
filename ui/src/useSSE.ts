import { useEffect, useRef, useState } from 'react'
import type { OutputEvent } from './types'

export function useSSE() {
  const [sessions, setSessions] = useState<Map<string, string[]>>(new Map())
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource('/api/sse')
    eventSourceRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.addEventListener('output', (e) => {
      const event: OutputEvent = JSON.parse(e.data)
      setSessions((prev) => {
        const next = new Map(prev)
        const lines = next.get(event.session_id) || []
        next.set(event.session_id, [...lines, event.content])
        return next
      })
    })

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [])

  const clearSession = (sessionId: string) => {
    setSessions((prev) => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
  }

  const clearAll = () => setSessions(new Map())

  return { sessions, connected, clearSession, clearAll }
}
