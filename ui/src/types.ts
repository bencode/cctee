export type OutputEvent = {
  session_id: string
  content: string
  timestamp: string
}

export type SessionInfo = {
  id: string
  command: string
  started_at: string
  last_activity: string
}
