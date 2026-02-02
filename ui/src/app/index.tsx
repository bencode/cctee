import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

const TerminalPage = lazy(() => import('../pages/terminal').then(m => ({ default: m.TerminalPage })))
const MobilePage = lazy(() => import('../pages/mobile').then(m => ({ default: m.MobilePage })))
const StatusPage = lazy(() => import('../pages/status').then(m => ({ default: m.StatusPage })))

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

function DeviceRedirect() {
  const target = isMobileDevice() ? '/mobile' : '/desktop'
  return <Navigate to={target} replace />
}

function Loading() {
  return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<DeviceRedirect />} />
        <Route path="/desktop" element={<TerminalPage />} />
        <Route path="/mobile" element={<MobilePage />} />
        <Route path="/status" element={<StatusPage />} />
      </Routes>
    </Suspense>
  )
}

export { App as default }
