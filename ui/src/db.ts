export type SessionRecord = {
  id: string          // `${token}:${sessionId}`
  token: string
  sessionId: string
  name?: string
  updatedAt: number
}

export type OutputChunk = {
  id?: number
  token: string
  sessionId: string
  content: string
}

const DB_NAME = 'teeclaude'
const DB_VERSION = 2
const SESSIONS_STORE = 'sessions'
const CHUNKS_STORE = 'output_chunks'

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' })
        store.createIndex('token', 'token', { unique: false })
      }
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE, { autoIncrement: true })
        store.createIndex('token_session', ['token', 'sessionId'], { unique: false })
        store.createIndex('token', 'token', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadSessions(token: string): Promise<SessionRecord[]> {
  const db = await openDB()
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

export async function saveSessionMeta(record: SessionRecord): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, 'readwrite')
    const store = tx.objectStore(SESSIONS_STORE)
    store.put(record)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function appendOutputChunk(token: string, sessionId: string, content: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readwrite')
    const store = tx.objectStore(CHUNKS_STORE)
    store.add({ token, sessionId, content } satisfies OutputChunk)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function loadSessionOutput(token: string, sessionId: string): Promise<string> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const index = store.index('token_session')
    const request = index.getAll([token, sessionId])
    request.onsuccess = () => {
      const chunks = request.result as OutputChunk[]
      resolve(chunks.map(c => c.content).join(''))
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function loadAllSessionOutputs(token: string): Promise<Map<string, string>> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, 'readonly')
    const store = tx.objectStore(CHUNKS_STORE)
    const index = store.index('token')
    const request = index.getAll(token)
    request.onsuccess = () => {
      const chunks = request.result as OutputChunk[]
      const map = new Map<string, string>()
      for (const chunk of chunks) {
        const prev = map.get(chunk.sessionId) ?? ''
        map.set(chunk.sessionId, prev + chunk.content)
      }
      resolve(map)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function deleteSession(token: string, sessionId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite')

    // Delete session metadata
    const sessStore = tx.objectStore(SESSIONS_STORE)
    sessStore.delete(`${token}:${sessionId}`)

    // Delete all chunks for this session
    const chunkStore = tx.objectStore(CHUNKS_STORE)
    const index = chunkStore.index('token_session')
    const request = index.openCursor([token, sessionId])
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function cleanupStaleTokens(validToken: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SESSIONS_STORE, CHUNKS_STORE], 'readwrite')

    // Clean sessions store
    const sessStore = tx.objectStore(SESSIONS_STORE)
    const sessRequest = sessStore.openCursor()
    sessRequest.onsuccess = () => {
      const cursor = sessRequest.result
      if (cursor) {
        const record = cursor.value as SessionRecord
        if (record.token !== validToken) cursor.delete()
        cursor.continue()
      }
    }

    // Clean chunks store
    const chunkStore = tx.objectStore(CHUNKS_STORE)
    const chunkRequest = chunkStore.openCursor()
    chunkRequest.onsuccess = () => {
      const cursor = chunkRequest.result
      if (cursor) {
        const chunk = cursor.value as OutputChunk
        if (chunk.token !== validToken) cursor.delete()
        cursor.continue()
      }
    }

    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
