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

  const { sessions, subscribe } = useEvents(token)

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

  const handleSendInput = useCallback((content: string) => {
    if (activeSession) {
      sendInput(activeSession, content + '\n')
    }
  }, [activeSession, sendInput])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        {sessions.size > 1 ? (
          <select
            className={styles.sessionSelect}
            value={activeSession ?? ''}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {sessionArray.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
        ) : (
          <h1>teeclaude</h1>
        )}
        <div className={styles.status}>
          <span className={`${styles.dot} ${sessions.size > 0 ? styles.connected : styles.disconnected}`} />
          {sessions.size > 0 ? '' : 'Waiting'}
        </div>
      </header>

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
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: 'underline',
      fontSize: 12,
      scrollback: 5000,
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

    loadSessionOutput(token, sessionId).then((output) => {
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
  }, [token, sessionId])

  useEffect(() => {
    return subscribe(sessionId, (content) => {
      if (terminalRef.current) {
        terminalRef.current.write(filterDesktopOutput(content))
        terminalRef.current.scrollToBottom()
      }
    })
  }, [sessionId, subscribe])

  return <div className={styles.terminalContainer} ref={containerRef} />
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
