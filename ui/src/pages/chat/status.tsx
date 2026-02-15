import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useToken } from '../../lib/use-token'
import styles from './status.module.scss'

type ChatStatusResponse = {
  listener_connected: boolean
  apps: string[]
}

export function ChatStatusPage() {
  const tokenState = useToken('chat')

  if (tokenState.status === 'loading') {
    return <div className={styles.page}><div className={styles.loading}>Loading...</div></div>
  }
  if (tokenState.status === 'error') {
    return <div className={styles.page}><div className={styles.error}>Error: {tokenState.message}</div></div>
  }

  return <ChatStatusContent token={tokenState.token} />
}

function ChatStatusContent({ token }: { token: string }) {
  const [status, setStatus] = useState<ChatStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/chat/status?token=${token}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setStatus(await res.json())
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status')
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [token])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Chat Status</h1>
        <Link to="/chat" className={styles.backLink}>← Back</Link>
      </header>

      {error && <div className={styles.error}>Error: {error}</div>}

      {status && (
        <section className={styles.info}>
          <div className={styles.card}>
            <span className={styles.label}>Listener</span>
            <span className={status.listener_connected ? styles.connected : styles.disconnected}>
              {status.listener_connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {status.apps.length > 0 && (
            <div className={styles.card}>
              <span className={styles.label}>Apps</span>
              <ul className={styles.appList}>
                {status.apps.map(app => <li key={app}>{app}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {!status && !error && <div className={styles.loading}>Loading...</div>}
    </div>
  )
}
