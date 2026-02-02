import { useEffect, useRef, useState, useCallback } from 'react'
import type { Message } from './types'

type OutputHandler = (sessionId: string, content: string) => void

export function useEvents(token: string | null, onOutput: OutputHandler) {
  const [sessionIds, setSessionIds] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const onOutputRef = useRef(onOutput)
  const reconnectTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    onOutputRef.current = onOutput
  }, [onOutput])

  const connect = useCallback(() => {
    if (!token) return null

    const url = `/api/events?token=${token}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    es.onerror = () => {
      setConnected(false)
      es.close()
      eventSourceRef.current = null
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000)
    }

    es.onmessage = (event) => {
      const message: Message = JSON.parse(event.data)

      if (message.type === 'output') {
        setSessionIds((prev) => {
          if (prev.has(message.session_id)) return prev
          return new Set([...prev, message.session_id])
        })
        onOutputRef.current(message.session_id, message.content)
      } else if (message.type === 'session_start') {
        setSessionIds((prev) => {
          if (prev.has(message.session_id)) return prev
          return new Set([...prev, message.session_id])
        })
      } else if (message.type === 'session_end') {
        setSessionIds((prev) => {
          const next = new Set(prev)
          next.delete(message.session_id)
          return next
        })
      } else if (message.type === 'active_sessions') {
        setSessionIds(new Set(message.session_ids))
      }
    }

    return es
  }, [token])

  useEffect(() => {
    const es = connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      es?.close()
    }
  }, [connect])

  const removeSession = useCallback((sessionId: string) => {
    setSessionIds((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  return { sessionIds, connected, removeSession }
}
