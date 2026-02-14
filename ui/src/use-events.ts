import { useEffect, useRef, useState, useCallback } from 'react'
import type { Message, SessionData } from './types'
import { loadSessions, saveSessionMeta, appendOutputChunk, loadAllSessionOutputs, deleteSession } from './db'
import type { SessionRecord } from './db'

export type Unsubscribe = () => void
export type OutputSubscriber = (content: string) => void

const FLUSH_INTERVAL = 2000

export function useEvents(token: string | null) {
  const [sessions, setSessions] = useState<Map<string, SessionData>>(new Map())
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const outputBuffersRef = useRef<Map<string, string>>(new Map())
  const sessionNamesRef = useRef<Map<string, string | undefined>>(new Map())
  const flushedLengthRef = useRef<Map<string, number>>(new Map())
  const flushTimerRef = useRef<number | null>(null)
  const tokenRef = useRef(token)
  const listenersRef = useRef<Map<string, Set<OutputSubscriber>>>(new Map())

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const subscribe = useCallback((sessionId: string, callback: OutputSubscriber): Unsubscribe => {
    const listeners = listenersRef.current
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set())
    listeners.get(sessionId)!.add(callback)
    return () => listeners.get(sessionId)?.delete(callback)
  }, [])

  const flushBuffers = useCallback(() => {
    const t = tokenRef.current
    if (!t) return
    const buffers = outputBuffersRef.current
    for (const [sessionId, output] of buffers) {
      const flushedLen = flushedLengthRef.current.get(sessionId) ?? 0
      if (output.length <= flushedLen) continue

      const delta = output.slice(flushedLen)
      flushedLengthRef.current.set(sessionId, output.length)
      appendOutputChunk(t, sessionId, delta).catch(console.error)

      const record: SessionRecord = {
        id: `${t}:${sessionId}`,
        token: t,
        sessionId,
        name: sessionNamesRef.current.get(sessionId),
        updatedAt: Date.now(),
      }
      saveSessionMeta(record).catch(console.error)
    }
  }, [])

  // Load stored sessions and outputs from IndexedDB on init
  useEffect(() => {
    if (!token) return
    Promise.all([
      loadSessions(token),
      loadAllSessionOutputs(token),
    ]).then(([records, outputs]) => {
      for (const r of records) {
        if (r.name) sessionNamesRef.current.set(r.sessionId, r.name)
      }
      for (const [sessionId, output] of outputs) {
        outputBuffersRef.current.set(sessionId, output)
        flushedLengthRef.current.set(sessionId, output.length)
      }
    }).catch(console.error)
  }, [token])

  // Periodic flush
  useEffect(() => {
    flushTimerRef.current = window.setInterval(flushBuffers, FLUSH_INTERVAL)
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    }
  }, [flushBuffers])

  // Flush on beforeunload
  useEffect(() => {
    const handler = () => flushBuffers()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [flushBuffers])

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
        setSessions((prev) => {
          if (prev.has(message.session_id)) return prev
          const next = new Map(prev)
          next.set(message.session_id, { id: message.session_id })
          return next
        })
        const prev = outputBuffersRef.current.get(message.session_id) || ''
        outputBuffersRef.current.set(message.session_id, prev + message.content)
        listenersRef.current.get(message.session_id)?.forEach(cb => cb(message.content))
      } else if (message.type === 'session_start') {
        setSessions((prev) => {
          const next = new Map(prev)
          next.set(message.session_id, { id: message.session_id, name: message.name })
          return next
        })
        sessionNamesRef.current.set(message.session_id, message.name)
      } else if (message.type === 'session_end') {
        setSessions((prev) => {
          const next = new Map(prev)
          next.delete(message.session_id)
          return next
        })
        outputBuffersRef.current.delete(message.session_id)
        sessionNamesRef.current.delete(message.session_id)
        flushedLengthRef.current.delete(message.session_id)
        listenersRef.current.delete(message.session_id)
        if (token) deleteSession(token, message.session_id).catch(console.error)
      } else if (message.type === 'active_sessions') {
        const activeIds = new Set(message.sessions.map((s) => s.id))
        setSessions(new Map(message.sessions.map((s) => [s.id, { id: s.id, name: s.name }])))
        for (const s of message.sessions) {
          sessionNamesRef.current.set(s.id, s.name)
        }
        // Clean up IndexedDB records for sessions no longer active
        if (token) {
          const t = token
          for (const sessionId of outputBuffersRef.current.keys()) {
            if (!activeIds.has(sessionId)) {
              outputBuffersRef.current.delete(sessionId)
              sessionNamesRef.current.delete(sessionId)
              flushedLengthRef.current.delete(sessionId)
              listenersRef.current.delete(sessionId)
              deleteSession(t, sessionId).catch(console.error)
            }
          }
        }
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
    setSessions((prev) => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
    outputBuffersRef.current.delete(sessionId)
    sessionNamesRef.current.delete(sessionId)
    flushedLengthRef.current.delete(sessionId)
    listenersRef.current.delete(sessionId)
    if (tokenRef.current) {
      deleteSession(tokenRef.current, sessionId).catch(console.error)
    }
  }, [])

  return { sessions, connected, removeSession, subscribe }
}
