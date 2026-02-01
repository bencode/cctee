import { Routes, Route } from 'react-router-dom'
import { TerminalPage } from '../pages/terminal'
import { StatusPage } from '../pages/status'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<TerminalPage />} />
      <Route path="/status" element={<StatusPage />} />
    </Routes>
  )
}

export { App as default }
