import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../app.js'

const envKeys = ['SESSION_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const

describe('auth routes', () => {
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    for (const key of envKeys) {
      const value = previousEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  async function makeApp() {
    process.env.SESSION_SECRET = 'test-session-secret'
    process.env.DATABASE_URL ??= 'postgres://paint:paint@127.0.0.1:5433/paint_with_me'
    process.env.DEV_LOGIN_ENABLED = 'false'
    const app = await createApp()
    apps.push(app)
    return app
  }

  it('allows the Google sign-in popup to reach this page', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/auth/config' })

    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups')
  })

  it('returns 401 from /api/auth/me when there is no session cookie', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' })

    expect(response.statusCode).toBe(401)
  })

  it('returns 204 from /api/auth/logout when there is no session cookie', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'POST', url: '/api/auth/logout' })

    expect(response.statusCode).toBe(204)
  })

  it('returns public auth config without secrets', async () => {
    process.env.SESSION_SECRET = 'test-session-secret'
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'super-secret-do-not-leak'
    const app = await createApp()
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/api/auth/config' })
    const body = response.json() as Record<string, unknown>

    expect(response.statusCode).toBe(200)
    expect(body).toEqual({
      googleClientId: 'test-client-id.apps.googleusercontent.com',
      devLoginEnabled: false,
    })
    expect(JSON.stringify(body)).not.toContain('super-secret-do-not-leak')
    expect(body).not.toHaveProperty('googleClientSecret')
    expect(body).not.toHaveProperty('SESSION_SECRET')
  })
})
