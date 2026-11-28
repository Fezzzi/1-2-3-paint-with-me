import { ApiError, apiJson } from './api/http.ts'

export type PublicUser = {
  id: string
  email: string
  displayName: string | null
  photoUrl: string | null
}

export type AuthConfig = {
  googleClientId: string
  devLoginEnabled: boolean
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const body = await apiJson<{ googleClientId?: unknown; devLoginEnabled?: unknown }>('/api/auth/config')
  return {
    googleClientId: typeof body.googleClientId === 'string' ? body.googleClientId : '',
    devLoginEnabled: body.devLoginEnabled === true,
  }
}

export async function fetchSessionUser(): Promise<PublicUser | null> {
  try {
    return await apiJson<PublicUser>('/api/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export async function signInWithGoogle(credential: string): Promise<PublicUser> {
  return apiJson<PublicUser>('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
}

export async function signInAsDeveloper(email?: string, name?: string): Promise<PublicUser> {
  return apiJson<PublicUser>('/api/auth/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  })
}

export async function signOutRequest(): Promise<void> {
  await apiJson('/api/auth/logout', { method: 'POST' })
}

export async function deleteAccount(email: string): Promise<void> {
  await apiJson('/api/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}
