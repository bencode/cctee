import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWebSocket } from '../use-websocket'
import styles from './style.module.scss'

function App() {
  const terminalsRef = useRef<Map<string, Terminal>>(new Map())

  const handleOutput = useCallback((sessionId: string, content: string) => {
    const terminal = terminalsRef.current.get(sessionId)
    if (terminal) {
      terminal.write(content)
    }
  }, [])

  const { sessionIds, connected, sendInput, removeSession, clearAll } = useWebSocket(handleOutput)

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
  }, [clearAll])

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

      <main className={styles.sessions}>
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
              onRegister={registerTerminal}
              onClear={() => handleClearSession(id)}
              onInput={(content) => sendInput(id, content)}
            />
          ))
        )}
      </main>
    </div>
  )
}

function SessionPanel({
  sessionId,
  onRegister,
  onClear,
  onInput,
}: {
  sessionId: string
  onRegister: (sessionId: string, terminal: Terminal) => void
  onClear: () => void
  onInput: (content: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [inputValue, setInputValue] = useState('')

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onInput(inputValue + '\n')
      setInputValue('')
    }
  }

  return (
    <div className={styles.session}>
      <div className={styles.sessionHeader}>
        <span className={styles.sessionId}>{sessionId.slice(0, 8)}</span>
        <button className={styles.close} onClick={onClear}>×</button>
      </div>
      <div className={styles.terminalContainer} ref={containerRef} />
      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type input and press Enter..."
        />
        <button type="submit" className={styles.sendButton}>Send</button>
      </form>
    </div>
  )
}

export { App as default }
