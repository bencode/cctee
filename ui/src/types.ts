export type OutputMessage = {
  type: 'output'
  session_id: string
  content: string
  timestamp: string
}

export type InputMessage = {
  type: 'input'
  session_id: string
  content: string
}

export type SessionStartMessage = {
  type: 'session_start'
  session_id: string
  command: string
  timestamp: string
}

export type SessionEndMessage = {
  type: 'session_end'
  session_id: string
  timestamp: string
}

export type Message = OutputMessage | InputMessage | SessionStartMessage | SessionEndMessage

export type SessionInfo = {
  id: string
  command: string
  started_at: string
  last_activity: string
}

export type TokenResponse = {
  token: string
  expires_at: string
  ws_url: string
  command_hint: string
}

export type TokenValidateResponse = {
  valid: boolean
  expires_at: string | null
}

export type TokenInfo = {
  token: string
  expires_at: string
  sessions: number
  is_valid: boolean
}

export type StatusSummary = {
  total_tokens: number
  valid_tokens: number
  total_sessions: number
}

export type StatusResponse = {
  tokens: TokenInfo[]
  summary: StatusSummary
}
