import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../app.js'

describe('paint routes', () => {
  const previousSessionSecret = process.env.SESSION_SECRET
  const previousDatabaseUrl = process.env.DATABASE_URL
  const apps: FastifyInstance[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = previousSessionSecret
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  })

  async function makeApp() {
    process.env.SESSION_SECRET = 'test-session-secret'
    process.env.DATABASE_URL ??= 'postgres://paint:paint@127.0.0.1:5433/paint_with_me'
    process.env.DEV_LOGIN_ENABLED = 'false'
    const app = await createApp()
    apps.push(app)
    return app
  }

  it('returns 401 from GET /api/paints when there is no session cookie', async () => {
    const app = await makeApp()
    const response = await app.inject({ method: 'GET', url: '/api/paints' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 from GET /api/paints when the session cookie is invalid', async () => {
    const app = await makeApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/paints',
      headers: { cookie: 'session=not-a-valid-signature' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'Unauthorized' })
  })
})
