export type AppInfo = {
  root: string
  name: string
}

export type ListenerReadyMessage = {
  type: 'listener_ready'
  apps: AppInfo[]
}

export type ChatInputMessage = {
  type: 'chat_input'
  chat_session_id: string | null
  app_root: string
  content: string
}

export type ChatOutputMessage = {
  type: 'chat_output'
  chat_session_id: string
  content: string
  timestamp: string
}

export type ChatDoneMessage = {
  type: 'chat_done'
  chat_session_id: string
  timestamp: string
}

export type ChatErrorMessage = {
  type: 'chat_error'
  chat_session_id: string
  error: string
  timestamp: string
}

export type ChatSessionCreatedMessage = {
  type: 'chat_session_created'
  chat_session_id: string
  app_root: string
  name: string
  timestamp: string
}

export type ChatMessage =
  | ListenerReadyMessage
  | ChatOutputMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | ChatSessionCreatedMessage

export type ChatSessionData = {
  id: string
  name: string
  app_root: string
  output: string
  status: 'idle' | 'streaming' | 'done' | 'error'
  error?: string
}

export type ChatUserMessage = {
  role: 'user'
  content: string
}

export type ChatAssistantMessage = {
  role: 'assistant'
  content: string
  status: 'streaming' | 'done' | 'error'
  error?: string
}

export type ChatEntry = ChatUserMessage | ChatAssistantMessage
