import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useToken } from '../../use-token'
import { useEvents } from '../../use-events'
import type { Unsubscribe } from '../../use-events'
import { loadSessionOutput } from '../../db'
import { filterDesktopOutput } from '../../utils/ansi-filter'
import type { SessionData } from '../../types'
import styles from './style.module.scss'

function formatSessionLabel(session: SessionData): string {
  const shortId = session.id.slice(0, 8)
  return session.name ? `${session.name} (${shortId})` : shortId
}

export function TerminalPage() {
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

  return <AppContent token={tokenState.token} commandHint={tokenState.commandHint} />
}

type SubscribeFn = (sessionId: string, callback: (content: string) => void) => Unsubscribe

function AppContent({ token, commandHint }: { token: string; commandHint: string }) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyCommand = async () => {
    await navigator.clipboard.writeText(commandHint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
        {sessions.size > 0 && (
          <div className={styles.commandHint} onClick={handleCopyCommand} title="Click to copy">
            <code>{commandHint}</code>
            <span className={styles.copyIcon}>{copied ? '✓' : '⎘'}</span>
          </div>
        )}
      </header>

      <main className={styles.sessions}>
        {sessions.size === 0 ? (
          <TokenGuide commandHint={commandHint} />
        ) : (
          sessionArray.map((session) => (
            <SessionPanel
              key={session.id}
              token={token}
              session={session}
              isActive={session.id === activeSession}
              subscribe={subscribe}
              onSelect={() => setSelectedSession(session.id)}
              onClear={() => handleClearSession(session.id)}
            />
          ))
        )}
      </main>

      {sessions.size > 0 && (
        <InputBar
          sessions={sessionArray}
          activeSession={activeSession}
          onSelectSession={setSelectedSession}
          onSend={handleSendInput}
        />
      )}
    </div>
  )
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
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function SessionPanel({
  token,
  session,
  isActive,
  subscribe,
  onSelect,
  onClear,
}: {
  token: string
  session: SessionData
  isActive: boolean
  subscribe: SubscribeFn
  onSelect: () => void
  onClear: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: 'underline',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Load stored output
    loadSessionOutput(token, session.id).then((output) => {
      if (output && terminalRef.current) {
        terminalRef.current.write(filterDesktopOutput(output))
      }
    }).catch(console.error)

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [token, session.id])

  // Subscribe to real-time output
  useEffect(() => {
    return subscribe(session.id, (content) => {
      if (terminalRef.current) {
        terminalRef.current.write(filterDesktopOutput(content))
        terminalRef.current.scrollToBottom()
      }
    })
  }, [session.id, subscribe])

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    onSelect()
  }

  return (
    <div
      className={`${styles.session} ${isActive ? styles.active : ''}`}
      onClick={handleClick}
    >
      <div className={styles.sessionHeader}>
        <span className={styles.sessionId}>{formatSessionLabel(session)}</span>
        <button className={styles.close} onClick={onClear}>×</button>
      </div>
      <div className={styles.terminalContainer} ref={containerRef} />
    </div>
  )
}

function InputBar({
  sessions,
  activeSession,
  onSelectSession,
  onSend,
}: {
  sessions: SessionData[]
  activeSession: string | null
  onSelectSession: (id: string) => void
  onSend: (content: string) => void
}) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim() && activeSession) {
      onSend(inputValue)
      setInputValue('')
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [activeSession])

  return (
    <form className={styles.inputBar} onSubmit={handleSubmit}>
      <select
        className={styles.sessionSelect}
        value={activeSession || ''}
        onChange={(e) => onSelectSession(e.target.value)}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatSessionLabel(session)}
          </option>
        ))}
      </select>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={activeSession ? 'Type input and press Enter...' : 'Select a session'}
        disabled={!activeSession}
      />
      <button
        type="submit"
        className={styles.sendButton}
        disabled={!activeSession || !inputValue.trim()}
      >
        Send
      </button>
    </form>
  )
}
