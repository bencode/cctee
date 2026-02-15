import { openDB } from '../../lib/db'

export type ChatSessionRecord = {
  id: string          // `${token}:${chatSessionId}`
  token: string
  chatSessionId: string
  appRoot: string
  name: string
  messages: string    // JSON-serialized ChatEntry[]
  updatedAt: number
}

const DB_NAME = 'teeclaude-chat'
const DB_VERSION = 1
const SESSIONS_STORE = 'chat_sessions'

function open(): Promise<IDBDatabase> {
  return openDB(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
      const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
      store.createIndex('token', 'token', { unique: false })
    }
  })
}

export async function loadChatSessions(token: string): Promise<ChatSessionRecord[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readonly')
    const store = tx.objectStore(SESSIONS_STORE)
    const index = store.index('token')
    const request = index.getAll(token)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function saveChatSession(record: ChatSessionRecord): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite')
    const store = tx.objectStore(SESSIONS_STORE)
    store.put(record)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function deleteChatSession(token: string, chatSessionId: string): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite')
    const store = tx.objectStore(SESSIONS_STORE)
    store.delete(`${token}:${chatSessionId}`)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
