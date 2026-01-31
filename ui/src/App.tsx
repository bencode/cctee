import { useSSE } from './useSSE'
import './App.css'

function App() {
  const { sessions, connected, clearSession, clearAll } = useSSE()

  return (
    <div className="app">
      <header className="header">
        <h1>ccorc</h1>
        <div className="status">
          <span className={`dot ${connected ? 'connected' : 'disconnected'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        {sessions.size > 0 && (
          <button className="clear-all" onClick={clearAll}>
            Clear All
          </button>
        )}
      </header>

      <main className="sessions">
        {sessions.size === 0 ? (
          <div className="empty">
            <p>No active sessions</p>
            <code>ccorc claude -p "your prompt"</code>
          </div>
        ) : (
          Array.from(sessions.entries()).map(([id, lines]) => (
            <SessionPanel
              key={id}
              sessionId={id}
              lines={lines}
              onClear={() => clearSession(id)}
            />
          ))
        )}
      </main>
    </div>
  )
}

function SessionPanel({
  sessionId,
  lines,
  onClear,
}: {
  sessionId: string
  lines: string[]
  onClear: () => void
}) {
  return (
    <div className="session">
      <div className="session-header">
        <span className="session-id">{sessionId.slice(0, 8)}</span>
        <button className="close" onClick={onClear}>×</button>
      </div>
      <pre className="output">{lines.join('')}</pre>
    </div>
  )
}

export default App
