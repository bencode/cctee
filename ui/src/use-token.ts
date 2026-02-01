import { useState, useEffect, useCallback } from 'react'
import type { TokenResponse, TokenValidateResponse } from './types'

type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string; commandHint: string }
  | { status: 'error'; message: string }

async function createToken(): Promise<TokenResponse> {
  const res = await fetch('/api/token', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create token')
  return res.json()
}

async function validateToken(token: string): Promise<TokenValidateResponse> {
  const res = await fetch('/api/token/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error('Failed to validate token')
  return res.json()
}

export function useToken() {
  const [state, setState] = useState<TokenState>({ status: 'loading' })

  const initToken = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')

    try {
      if (urlToken) {
        const validation = await validateToken(urlToken)
        if (validation.valid) {
          const host = window.location.origin
          const commandHint = `cctee --server=${host} --token=${urlToken} claude`
          setState({ status: 'ready', token: urlToken, commandHint })
          return
        }
      }

      const response = await createToken()
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('token', response.token)
      window.history.replaceState({}, '', newUrl.toString())
      setState({ status: 'ready', token: response.token, commandHint: response.command_hint })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }, [])

  useEffect(() => {
    initToken()
  }, [initToken])

  return state
}
