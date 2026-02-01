import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWebSocket } from '../use-websocket'
import styles from './style.module.scss'

function App() {
  const terminalsRef = useRef<Map<string, Terminal>>(new Map())
  const [selectedSession, setSelectedSession] = useState<string | null>(null)

  const handleOutput = useCallback((sessionId: string, content: string) => {
    const terminal = terminalsRef.current.get(sessionId)
    if (terminal) {
      terminal.write(content)
      terminal.scrollToBottom()
    }
  }, [])

  const { sessionIds, connected, sendInput, removeSession, clearAll } = useWebSocket(handleOutput)

  // Compute effective active session: use selected if valid, otherwise first session
  const sessionArray = Array.from(sessionIds)
  const activeSession = selectedSession && sessionIds.has(selectedSession)
    ? selectedSession
    : sessionArray[0] ?? null

  const registerTerminal = useCallback((sessionId: string, terminal: Terminal) => {
    terminalsRef.current.set(sessionId, terminal)
  }, [])

  const unregisterTerminal = useCallback((sessionId: string) => {
    const terminal = terminalsRef.current.get(sessionId)
    if (terminal) {
      terminal.dispose()
      terminalsRef.current.delete(sessionId)
    }
  }, [])

  const handleClearSession = useCallback((sessionId: string) => {
    unregisterTerminal(sessionId)
    removeSession(sessionId)
  }, [unregisterTerminal, removeSession])

  const handleClearAll = useCallback(() => {
    terminalsRef.current.forEach((terminal) => terminal.dispose())
    terminalsRef.current.clear()
    clearAll()
    setSelectedSession(null)
  }, [clearAll])

  const handleSendInput = useCallback((content: string) => {
    if (activeSession) {
      sendInput(activeSession, content + '\n')
    }
  }, [activeSession, sendInput])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>cctee</h1>
        <div className={styles.status}>
          <span className={`${styles.dot} ${connected ? styles.connected : styles.disconnected}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        {sessionIds.size > 0 && (
          <button className={styles.clearAll} onClick={handleClearAll}>
            Clear All
          </button>
        )}
      </header>

      <main className={`${styles.sessions} ${styles[`count${Math.min(sessionIds.size, 3)}`] || ''}`}>
        {sessionIds.size === 0 ? (
          <div className={styles.empty}>
            <p>No active sessions</p>
            <code>cctee claude -p "your prompt"</code>
          </div>
        ) : (
          Array.from(sessionIds).map((id) => (
            <SessionPanel
              key={id}
              sessionId={id}
              sessionCount={sessionIds.size}
              isActive={id === activeSession}
              onSelect={() => setSelectedSession(id)}
              onRegister={registerTerminal}
              onClear={() => handleClearSession(id)}
            />
          ))
        )}
      </main>

      {sessionIds.size > 0 && (
        <InputBar
          sessionIds={Array.from(sessionIds)}
          activeSession={activeSession}
          onSelectSession={setSelectedSession}
          onSend={handleSendInput}
        />
      )}
    </div>
  )
}

function SessionPanel({
  sessionId,
  sessionCount,
  isActive,
  onSelect,
  onRegister,
  onClear,
}: {
  sessionId: string
  sessionCount: number
  isActive: boolean
  onSelect: () => void
  onRegister: (sessionId: string, terminal: Terminal) => void
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
    onRegister(sessionId, terminal)

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [sessionId, onRegister])

  // Re-fit terminal when session count changes (layout changes)
  useEffect(() => {
    if (fitAddonRef.current) {
      // Delay fit to allow CSS transition
      const timer = setTimeout(() => fitAddonRef.current?.fit(), 50)
      return () => clearTimeout(timer)
    }
  }, [sessionCount])

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
        <span className={styles.sessionId}>{sessionId.slice(0, 8)}</span>
        <button className={styles.close} onClick={onClear}>×</button>
      </div>
      <div className={styles.terminalContainer} ref={containerRef} />
    </div>
  )
}

function InputBar({
  sessionIds,
  activeSession,
  onSelectSession,
  onSend,
}: {
  sessionIds: string[]
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
        {sessionIds.map((id) => (
          <option key={id} value={id}>
            {id.slice(0, 8)}
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

export { App as default }
