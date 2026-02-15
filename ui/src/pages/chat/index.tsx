import { useState, useRef, useEffect } from 'react'
import { useToken } from '../../lib/use-token'
import { useChat } from './use-chat'
import type { ChatEntry } from './types'
import styles from './style.module.scss'

export function ChatPage() {
  const tokenState = useToken('chat')

  if (tokenState.status === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.center}>Loading...</div>
      </div>
    )
  }

  if (tokenState.status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.center + ' ' + styles.error}>Error: {tokenState.message}</div>
      </div>
    )
  }

  return <ChatContent token={tokenState.token} commandHint={tokenState.commandHint} />
}

function ChatContent({ token, commandHint }: { token: string; commandHint: string }) {
  const {
    listenerConnected,
    apps,
    sessions,
    currentSessionId,
    messages,
    sendMessage,
    selectSession,
    startNewSession,
  } = useChat(token)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const activeApp = selectedApp ?? apps[0]?.root ?? null

  if (!listenerConnected) {
    return <WaitingForListener commandHint={commandHint} />
  }

  const sessionArray = Array.from(sessions.values())
  const currentMessages = currentSessionId ? (messages.get(currentSessionId) ?? []) : []
  const currentSession = currentSessionId ? sessions.get(currentSessionId) : null

  return (
    <div className={styles.page}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>Sessions</h2>
          <button className={styles.newChat} onClick={() => { startNewSession(); setSidebarOpen(false) }}>
            + New
          </button>
        </div>
        {apps.length > 1 && (
          <select
            className={styles.appSelect}
            value={activeApp ?? ''}
            onChange={(e) => setSelectedApp(e.target.value)}
          >
            {apps.map(app => (
              <option key={app.root} value={app.root}>{app.name}</option>
            ))}
          </select>
        )}
        <div className={styles.sessionList}>
          {sessionArray.map(session => (
            <button
              key={session.id}
              className={`${styles.sessionItem} ${session.id === currentSessionId ? styles.active : ''}`}
              onClick={() => { selectSession(session.id); setSidebarOpen(false) }}
            >
              <span className={styles.sessionName}>{session.name || session.id.slice(0, 8)}</span>
              {session.status === 'streaming' && <span className={styles.streamingDot} />}
            </button>
          ))}
          {sessionArray.length === 0 && (
            <div className={styles.noSessions}>No sessions yet</div>
          )}
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Main chat area */}
      <main className={styles.main}>
        <header className={styles.chatHeader}>
          <button className={styles.menuButton} onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <span className={styles.chatTitle}>
            {currentSession?.name ?? 'New Chat'}
          </span>
          <span className={styles.connectionStatus}>
            <span className={styles.connectedDot} />
            {apps.length > 0 && apps[0].name}
          </span>
        </header>

        <MessageList
          messages={currentMessages}
          isStreaming={currentSession?.status === 'streaming'}
        />

        <ChatInput
          onSend={(content) => sendMessage(content, activeApp ?? undefined)}
          disabled={currentSession?.status === 'streaming'}
        />
      </main>
    </div>
  )
}

function WaitingForListener({ commandHint }: { commandHint: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commandHint)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.page}>
      <div className={styles.waiting}>
        <h2>Waiting for listener...</h2>
        <p>Run this command in your project directory:</p>
        <div className={styles.commandBox}>
          <code>{commandHint}</code>
        </div>
        <button className={styles.copyButton} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy Command'}
        </button>
      </div>
    </div>
  )
}

function MessageList({ messages, isStreaming }: { messages: ChatEntry[]; isStreaming: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className={styles.messages} ref={containerRef}>
      {messages.length === 0 && (
        <div className={styles.emptyChat}>
          Send a message to start chatting with Claude
        </div>
      )}
      {messages.map((msg, i) => (
        <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
          <div className={styles.messageRole}>{msg.role === 'user' ? 'You' : 'Claude'}</div>
          <div className={styles.messageContent}>
            <pre>{msg.content}</pre>
            {msg.role === 'assistant' && msg.status === 'error' && msg.error && (
              <div className={styles.messageError}>{msg.error}</div>
            )}
          </div>
        </div>
      ))}
      {isStreaming && (
        <div className={styles.streamingIndicator}>Claude is thinking...</div>
      )}
    </div>
  )
}

function ChatInput({ onSend, disabled }: { onSend: (content: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim())
      setValue('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }

  return (
    <div className={styles.inputArea}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Send a message..."
        disabled={disabled}
        rows={1}
      />
      <button
        className={styles.sendButton}
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </div>
  )
}
