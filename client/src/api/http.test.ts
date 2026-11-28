import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiJson, onSessionExpired } from './http.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiJson', () => {
  it('throws ApiError with the server message and code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Nope', code: 'bad' }), { status: 400 })),
    )
    await expect(apiJson('/api/projects')).rejects.toMatchObject({ name: 'ApiError', status: 400, message: 'Nope', code: 'bad' })
    await expect(apiJson('/api/projects')).rejects.toBeInstanceOf(ApiError)
  })

  it('dispatches session-expired on a 401 from a data route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    let fired = 0
    const onExpired = () => {
      fired += 1
    }
    const stop = onSessionExpired(onExpired)
    await expect(apiJson('/api/projects')).rejects.toBeInstanceOf(ApiError)
    stop()
    expect(fired).toBe(1)
  })

  it('does not treat a signed-out session check as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })))
    let fired = 0
    const onExpired = () => {
      fired += 1
    }
    const stop = onSessionExpired(onExpired)
    await expect(apiJson('/api/auth/me')).rejects.toBeInstanceOf(ApiError)
    stop()
    expect(fired).toBe(0)
  })
})
