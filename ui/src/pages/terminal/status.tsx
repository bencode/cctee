import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { StatusResponse } from '../../lib/types'
import styles from './status.module.scss'

export function TerminalStatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/terminal/status')
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        setStatus(data)
        setLastUpdate(new Date())
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status')
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString()
  }

  const formatExpiry = (expiresAt: string) => {
    const date = new Date(expiresAt)
    return date.toLocaleString()
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Terminal Status</h1>
        <Link to="/terminal" className={styles.backLink}>← Back</Link>
      </header>

      {error && <div className={styles.error}>Error: {error}</div>}

      {status && (
        <>
          <section className={styles.summary}>
            <div className={styles.summaryHeader}>
              <h2>Summary</h2>
              {lastUpdate && (
                <span className={styles.lastUpdate}>Last: {formatTime(lastUpdate)}</span>
              )}
            </div>
            <div className={styles.cards}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Tokens</span>
                <span className={styles.cardValue}>{status.summary.total_tokens}</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Valid</span>
                <span className={styles.cardValue}>{status.summary.valid_tokens}</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Sessions</span>
                <span className={styles.cardValue}>{status.summary.total_sessions}</span>
              </div>
            </div>
          </section>

          <section className={styles.tokens}>
            <h2>Tokens</h2>
            {status.tokens.length === 0 ? (
              <p className={styles.empty}>No tokens</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Sessions</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {status.tokens.map((token) => (
                    <tr key={token.token}>
                      <td className={styles.tokenCell}>{token.token}</td>
                      <td>{token.sessions}</td>
                      <td>{formatExpiry(token.expires_at)}</td>
                      <td>
                        <span className={token.is_valid ? styles.valid : styles.expired}>
                          {token.is_valid ? 'valid' : 'expired'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!status && !error && <div className={styles.loading}>Loading...</div>}
    </div>
  )
}
