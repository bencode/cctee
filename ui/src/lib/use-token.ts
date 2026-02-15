import { useState, useEffect, useCallback } from 'react'
import type { TokenResponse, TokenValidateResponse } from './types'

type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string; commandHint: string }
  | { status: 'error'; message: string }

async function createToken(prefix: string): Promise<TokenResponse> {
  const res = await fetch(`${prefix}/token`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create token')
  return res.json()
}

async function validateToken(prefix: string, token: string): Promise<TokenValidateResponse> {
  const res = await fetch(`${prefix}/token/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) throw new Error('Failed to validate token')
  return res.json()
}

export function useToken(mode: 'terminal' | 'chat') {
  const [state, setState] = useState<TokenState>({ status: 'loading' })
  const prefix = `/api/${mode}`

  const initToken = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')

    try {
      if (urlToken) {
        const validation = await validateToken(prefix, urlToken)
        if (validation.valid) {
          const commandHint = buildCommandHint(mode, urlToken)
          setState({ status: 'ready', token: urlToken, commandHint })
          return
        }
      }

      const response = await createToken(prefix)
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.set('token', response.token)
      window.history.replaceState({}, '', newUrl.toString())
      setState({
        status: 'ready',
        token: response.token,
        commandHint: response.command_hint,
      })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }, [prefix, mode])

  useEffect(() => {
    initToken()
  }, [initToken])

  return state
}

function buildCommandHint(mode: 'terminal' | 'chat', token: string): string {
  const host = window.location.origin
  if (mode === 'chat') {
    return `teeclaude --server=${host} --token=${token} start`
  }
  return `teeclaude --server=${host} --token=${token} claude`
}
