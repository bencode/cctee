import { useEffect, useRef, useState, useCallback } from 'react'
import type { Message } from './types'

type OutputHandler = (sessionId: string, content: string) => void

export function useWebSocket(onOutput: OutputHandler) {
  const [sessionIds, setSessionIds] = useState<Set<string>>(new Set())
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onOutputRef = useRef(onOutput)
  const reconnectTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    onOutputRef.current = onOutput
  }, [onOutput])

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/ui`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Auto reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
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
        // Keep session visible, user can clear manually
      }
    }

    return ws
  }, [])

  useEffect(() => {
    const ws = connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      ws.close()
    }
  }, [connect])

  const sendInput = useCallback((sessionId: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: Message = {
        type: 'input',
        session_id: sessionId,
        content,
      }
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const removeSession = useCallback((sessionId: string) => {
    setSessionIds((prev) => {
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
  }, [])

  const clearAll = useCallback(() => setSessionIds(new Set()), [])

  return { sessionIds, connected, sendInput, removeSession, clearAll }
}
