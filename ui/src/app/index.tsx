import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

const TerminalPage = lazy(() => import('../pages/terminal/desktop').then(m => ({ default: m.TerminalPage })))
const MobilePage = lazy(() => import('../pages/terminal/mobile').then(m => ({ default: m.MobilePage })))
const TerminalStatusPage = lazy(() => import('../pages/terminal/status').then(m => ({ default: m.TerminalStatusPage })))
const ChatPage = lazy(() => import('../pages/chat').then(m => ({ default: m.ChatPage })))
const ChatStatusPage = lazy(() => import('../pages/chat/status').then(m => ({ default: m.ChatStatusPage })))

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

function TerminalRedirect() {
  const target = isMobileDevice() ? '/terminal/mobile' : '/terminal/desktop'
  return <Navigate to={target} replace />
}

function Loading() {
  return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/status" element={<ChatStatusPage />} />
        <Route path="/terminal" element={<TerminalRedirect />} />
        <Route path="/terminal/desktop" element={<TerminalPage />} />
        <Route path="/terminal/mobile" element={<MobilePage />} />
        <Route path="/terminal/status" element={<TerminalStatusPage />} />
      </Routes>
    </Suspense>
  )
}

export { App as default }
