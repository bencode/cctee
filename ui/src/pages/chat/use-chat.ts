import { useEffect, useRef, useState, useCallback } from 'react'
import type { AppInfo, ChatMessage, ChatEntry, ChatSessionData } from './types'
import { loadChatSessions, saveChatSession } from './db'
import type { ChatSessionRecord } from './db'

type ChatState = {
  listenerConnected: boolean
  apps: AppInfo[]
  sessions: Map<string, ChatSessionData>
  currentSessionId: string | null
  connected: boolean
}

export function useChat(token: string | null) {
  const [state, setState] = useState<ChatState>({
    listenerConnected: false,
    apps: [],
    sessions: new Map(),
    currentSessionId: null,
    connected: false,
  })
  const [messages, setMessages] = useState<Map<string, ChatEntry[]>>(new Map())

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const tokenRef = useRef(token)
  const messagesRef = useRef(messages)
  const stateRef = useRef(state)
  const pendingUserMessageRef = useRef<string | null>(null)
  const pendingAppRootRef = useRef<string | null>(null)

  useEffect(() => { tokenRef.current = token }, [token])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { stateRef.current = state }, [state])

  // Load persisted sessions
  useEffect(() => {
    if (!token) return
    loadChatSessions(token).then((records) => {
      const sessions = new Map<string, ChatSessionData>()
      const msgs = new Map<string, ChatEntry[]>()
      for (const r of records) {
        sessions.set(r.chatSessionId, {
          id: r.chatSessionId,
          name: r.name,
          app_root: r.appRoot,
          output: '',
          status: 'idle',
        })
        try {
          msgs.set(r.chatSessionId, JSON.parse(r.messages))
        } catch {
          msgs.set(r.chatSessionId, [])
        }
      }
      if (sessions.size > 0) {
        setState(prev => ({
          ...prev,
          sessions,
          currentSessionId: prev.currentSessionId ?? sessions.keys().next().value ?? null,
        }))
        setMessages(msgs)
      }
    }).catch(console.error)
  }, [token])

  const persistSession = useCallback((sessionId: string, entries: ChatEntry[], sessionData: ChatSessionData) => {
    const t = tokenRef.current
    if (!t) return
    const record: ChatSessionRecord = {
      id: `${t}:${sessionId}`,
      token: t,
      chatSessionId: sessionId,
      appRoot: sessionData.app_root,
      name: sessionData.name,
      messages: JSON.stringify(entries),
      updatedAt: Date.now(),
    }
    saveChatSession(record).catch(console.error)
  }, [])

  const triggerRefreshApps = useCallback(() => {
    const t = tokenRef.current
    if (!t) return
    fetch('/api/chat/refresh-apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t }),
    }).catch(console.error)
  }, [])

  const connect = useCallback(() => {
    if (!token) return null

    const url = `/api/chat/events?token=${token}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      setState(prev => ({ ...prev, connected: true }))
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    es.onerror = () => {
      setState(prev => ({ ...prev, connected: false }))
      es.close()
      eventSourceRef.current = null
      reconnectTimeoutRef.current = window.setTimeout(connect, 2000)
    }

    es.onmessage = (event) => {
      const message: ChatMessage = JSON.parse(event.data)

      if (message.type === 'listener_ready') {
        setState(prev => ({
          ...prev,
          listenerConnected: true,
          apps: message.apps,
        }))
      } else if (message.type === 'chat_session_created') {
        const session: ChatSessionData = {
          id: message.chat_session_id,
          name: message.name,
          app_root: message.app_root,
          output: '',
          status: 'streaming',
        }
        setState(prev => {
          const sessions = new Map(prev.sessions)
          sessions.set(message.chat_session_id, session)
          return { ...prev, sessions, currentSessionId: message.chat_session_id }
        })
        setMessages(prev => {
          const next = new Map(prev)
          const entries: ChatEntry[] = []
          // Inject pending user message if any
          const pending = pendingUserMessageRef.current
          if (pending) {
            entries.push({ role: 'user', content: pending })
            pendingUserMessageRef.current = null
          }
          next.set(message.chat_session_id, entries)
          return next
        })
      } else if (message.type === 'chat_output') {
        const { text, uiCalls } = extractAssistantText(message.content)
        if (uiCalls.includes('refresh_apps')) {
          triggerRefreshApps()
        }
        if (!text) return
        setState(prev => {
          const sessions = new Map(prev.sessions)
          const session = sessions.get(message.chat_session_id)
          if (session) {
            sessions.set(message.chat_session_id, {
              ...session,
              output: session.output + text,
              status: 'streaming',
            })
          }
          return { ...prev, sessions }
        })
        setMessages(prev => {
          const next = new Map(prev)
          const entries = [...(next.get(message.chat_session_id) ?? [])]
          const last = entries[entries.length - 1]
          if (last && last.role === 'assistant' && last.status === 'streaming') {
            entries[entries.length - 1] = { ...last, content: last.content + text }
          } else {
            entries.push({ role: 'assistant', content: text, status: 'streaming' })
          }
          next.set(message.chat_session_id, entries)
          return next
        })
      } else if (message.type === 'chat_done') {
        setState(prev => {
          const sessions = new Map(prev.sessions)
          const session = sessions.get(message.chat_session_id)
          if (session) {
            sessions.set(message.chat_session_id, { ...session, status: 'done' })
          }
          return { ...prev, sessions }
        })
        setMessages(prev => {
          const next = new Map(prev)
          const entries = next.get(message.chat_session_id)
          if (entries) {
            const updated = entries.map(e =>
              e.role === 'assistant' && e.status === 'streaming'
                ? { ...e, status: 'done' as const }
                : e
            )
            next.set(message.chat_session_id, updated)

            // Persist
            const session = stateRef.current.sessions.get(message.chat_session_id)
            if (session) {
              persistSession(message.chat_session_id, updated, { ...session, status: 'done' })
            }
          }
          return next
        })
      } else if (message.type === 'chat_error') {
        setState(prev => {
          const sessions = new Map(prev.sessions)
          const session = sessions.get(message.chat_session_id)
          if (session) {
            sessions.set(message.chat_session_id, {
              ...session,
              status: 'error',
              error: message.error,
            })
          }
          return { ...prev, sessions }
        })
        setMessages(prev => {
          const next = new Map(prev)
          const entries = [...(next.get(message.chat_session_id) ?? [])]
          const last = entries[entries.length - 1]
          if (last && last.role === 'assistant' && last.status === 'streaming') {
            entries[entries.length - 1] = { ...last, status: 'error', error: message.error }
          } else {
            entries.push({ role: 'assistant', content: '', status: 'error', error: message.error })
          }
          next.set(message.chat_session_id, entries)
          return next
        })
      }
    }

    return es
  }, [token, persistSession, triggerRefreshApps])

  useEffect(() => {
    const es = connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      es?.close()
    }
  }, [connect])

  const sendMessage = useCallback(async (content: string, appRoot?: string) => {
    if (!token) return

    const currentApps = stateRef.current.apps
    const app = appRoot ?? pendingAppRootRef.current ?? currentApps[0]?.root
    if (!app) return
    pendingAppRootRef.current = null

    const sessionId = stateRef.current.currentSessionId

    // Add user message to current session, or store as pending for new session
    if (sessionId) {
      setMessages(prev => {
        const next = new Map(prev)
        const entries = [...(next.get(sessionId) ?? [])]
        entries.push({ role: 'user', content })
        next.set(sessionId, entries)
        return next
      })
    } else {
      pendingUserMessageRef.current = content
    }

    const res = await fetch('/api/chat/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        chat_session_id: sessionId,
        app_root: app,
        content,
      }),
    })

    if (!res.ok) {
      console.error('Failed to send chat input:', res.status)
    }
  }, [token])

  const selectSession = useCallback((sessionId: string) => {
    setState(prev => ({ ...prev, currentSessionId: sessionId }))
  }, [])

  const startNewSession = useCallback((appRoot?: string) => {
    pendingAppRootRef.current = appRoot ?? null
    setState(prev => ({ ...prev, currentSessionId: null }))
  }, [])

  return {
    ...state,
    messages,
    sendMessage,
    selectSession,
    startNewSession,
  }
}

type ExtractResult = { text: string | null; uiCalls: string[] }

const UI_CALL_RE = /<ui_call>\s*([\s\S]*?)\s*<\/ui_call>/g

function extractAssistantText(raw: string): ExtractResult {
  const event = JSON.parse(raw)
  if (event.type !== 'assistant') return { text: null, uiCalls: [] }
  const content = event.message?.content
  if (!Array.isArray(content)) return { text: null, uiCalls: [] }
  let joined = content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
  if (!joined) return { text: null, uiCalls: [] }

  const uiCalls: string[] = []
  for (const m of joined.matchAll(UI_CALL_RE)) {
    try {
      const parsed = JSON.parse(m[1])
      if (Array.isArray(parsed)) uiCalls.push(...parsed)
    } catch { /* ignore malformed */ }
  }
  const text = joined.replace(UI_CALL_RE, '') || null
  return { text, uiCalls }
}
