import { useRef, useEffect, useCallback, useState } from 'react'
import { useToken } from '../../use-token'
import { useEvents } from '../../use-events'
import type { Unsubscribe } from '../../use-events'
import { loadSessionOutput } from '../../db'
import { processMobileOutput, appendMobileOutput, filterMobileOutput } from '../../utils/ansi-filter'
import type { SessionData } from '../../types'
import styles from './style.module.scss'

function formatSessionLabel(session: SessionData): string {
  const shortId = session.id.slice(0, 8)
  return session.name ? `${session.name} (${shortId})` : shortId
}

export function MobilePage() {
  const tokenState = useToken()

  if (tokenState.status === 'loading') {
    return (
      <div className={styles.app}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (tokenState.status === 'error') {
    return (
      <div className={styles.app}>
        <div className={styles.error}>Error: {tokenState.message}</div>
      </div>
    )
  }

  return <MobileContent token={tokenState.token} commandHint={tokenState.commandHint} />
}

type SubscribeFn = (sessionId: string, callback: (content: string) => void) => Unsubscribe

function MobileContent({ token, commandHint }: { token: string; commandHint: string }) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  const { sessions, removeSession, subscribe } = useEvents(token)

  const sendInput = useCallback(async (sessionId: string, content: string) => {
    const res = await fetch('/api/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, session_id: sessionId, content }),
    })
    if (!res.ok) {
      console.error('Failed to send input:', res.status)
    }
  }, [token])

  const sessionArray = Array.from(sessions.values())
  const activeSession = selectedSession && sessions.has(selectedSession)
    ? selectedSession
    : sessionArray[0]?.id ?? null

  const handleClearSession = useCallback((sessionId: string) => {
    removeSession(sessionId)
  }, [removeSession])

  const handleSendInput = useCallback((content: string) => {
    if (activeSession) {
      sendInput(activeSession, content + '\n')
    }
  }, [activeSession, sendInput])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>teeclaude</h1>
        <div className={styles.status}>
          <span className={`${styles.dot} ${sessions.size > 0 ? styles.connected : styles.disconnected}`} />
          {sessions.size > 0 ? `${sessions.size} session${sessions.size > 1 ? 's' : ''}` : 'Waiting'}
        </div>
      </header>

      {sessions.size > 1 && (
        <SessionTabs
          sessions={sessionArray}
          activeSession={activeSession}
          onSelect={setSelectedSession}
          onClose={handleClearSession}
        />
      )}

      <main className={styles.content}>
        {sessions.size === 0 ? (
          <TokenGuide commandHint={commandHint} />
        ) : activeSession ? (
          <SessionPanel
            key={activeSession}
            token={token}
            sessionId={activeSession}
            subscribe={subscribe}
          />
        ) : null}
      </main>

      {sessions.size > 0 && (
        <InputBar onSend={handleSendInput} disabled={!activeSession} />
      )}
    </div>
  )
}

function SessionPanel({
  token,
  sessionId,
  subscribe,
}: {
  token: string
  sessionId: string
  subscribe: SubscribeFn
}) {
  const [output, setOutput] = useState('')
  const outputRef = useRef<HTMLDivElement>(null)

  // Load history from IndexedDB
  useEffect(() => {
    loadSessionOutput(token, sessionId).then((output) => {
      if (output) {
        setOutput(filterMobileOutput(output))
      }
    }).catch(console.error)
  }, [token, sessionId])

  // Subscribe to real-time output
  useEffect(() => {
    return subscribe(sessionId, (content) => {
      const result = processMobileOutput(content)
      setOutput((prev) => {
        if (result.type === 'clear') return result.content
        return appendMobileOutput(prev, result.content)
      })
    })
  }, [sessionId, subscribe])

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  return <OutputView ref={outputRef} content={output} />
}

function TokenGuide({ commandHint }: { commandHint: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commandHint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.empty}>
      <p>No active sessions</p>
      <p className={styles.guideText}>Run this command in your terminal:</p>
      <div className={styles.commandBox}>
        <code>{commandHint}</code>
      </div>
      <button className={styles.copyButton} onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy Command'}
      </button>
    </div>
  )
}

function SessionTabs({
  sessions,
  activeSession,
  onSelect,
  onClose,
}: {
  sessions: SessionData[]
  activeSession: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <div className={styles.tabs}>
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`${styles.tab} ${session.id === activeSession ? styles.active : ''}`}
          onClick={() => onSelect(session.id)}
        >
          <span className={styles.tabId}>{formatSessionLabel(session)}</span>
          <button
            className={styles.tabClose}
            onClick={(e) => {
              e.stopPropagation()
              onClose(session.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

import { forwardRef } from 'react'

const OutputView = forwardRef<HTMLDivElement, { content: string }>(
  function OutputView({ content }, ref) {
    return (
      <div className={styles.output} ref={ref}>
        <div className={styles.outputText}>{content || 'Waiting for output...'}</div>
      </div>
    )
  }
)

function InputBar({
  onSend,
  disabled,
}: {
  onSend: (content: string) => void
  disabled: boolean
}) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim() && !disabled) {
      onSend(inputValue)
      setInputValue('')
    }
  }

  return (
    <form className={styles.inputBar} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={disabled ? 'No active session' : 'Type input...'}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <button
        type="submit"
        className={styles.sendButton}
        disabled={disabled || !inputValue.trim()}
      >
        Send
      </button>
    </form>
  )
}
