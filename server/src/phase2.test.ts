import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, describe, expect, it } from 'vitest'
import { hashSessionToken } from './auth/session.js'
import { closeDb, getDb } from './db/client.js'
import { sessions, users } from './db/schema.js'
import { uploadsDirectory } from './files/store.js'
import { createApp } from './app.js'

const readiness = await databaseReadiness()
if (!readiness.ok) console.warn(`Skipping phase 2 database tests: ${readiness.reason}`)

describe('phase 2 API', () => {
  const apps: FastifyInstance[] = []

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
    await closeDb()
  })

  async function appWith(devLogin: boolean) {
    process.env.NODE_ENV = 'test'
    process.env.SESSION_SECRET = 'test-session-secret'
    process.env.DATABASE_URL ??= 'postgres://paint:paint@127.0.0.1:5433/paint_with_me'
    process.env.DEV_LOGIN_ENABLED = devLogin ? 'true' : 'false'
    process.env.COOKIE_SECURE = 'false'
    const app = await createApp()
    apps.push(app)
    return app
  }

  function cookieOf(response: { headers: Record<string, string | string[] | undefined> }): string {
    const raw = response.headers['set-cookie']
    const value = Array.isArray(raw) ? raw[0] : raw
    return value?.split(';')[0] ?? ''
  }

  it.skipIf(!readiness.ok)('does not register dev login unless it is enabled', async () => {
    const app = await appWith(false)
    const response = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: {} })
    expect(response.statusCode).toBe(404)
  })

  it.skipIf(!readiness.ok)('creates, rolls, expires, and logs out a server session', async () => {
    const app = await appWith(true)
    const signed = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: `phase2-${randomUUID()}@example.com` } })
    expect(signed.statusCode).toBe(200)
    const cookie = cookieOf(signed)
    const token = cookie.slice('session='.length)
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)

    const db = getDb()
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) })
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
    const rolled = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(rolled.statusCode).toBe(200)
    const row = await db.select().from(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
    expect((row[0]?.expiresAt.getTime() ?? 0) > Date.now() + 20 * 24 * 60 * 60 * 1000).toBe(true)

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.tokenHash, hashSessionToken(token)))
    const expired = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(expired.statusCode).toBe(401)

    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { email: `phase2-out-${randomUUID()}@example.com` },
    })
    const nextCookie = cookieOf(again)
    const nextToken = nextCookie.slice('session='.length)
    const loggedOut = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: nextCookie } })
    expect(loggedOut.statusCode).toBe(204)
    const cleared = loggedOut.headers['set-cookie']
    const clearedHeader = Array.isArray(cleared) ? cleared.join(';') : String(cleared ?? '')
    expect(clearedHeader).toMatch(/HttpOnly/i)
    expect(clearedHeader).toMatch(/SameSite=Lax/i)
    expect(clearedHeader).toMatch(/Path=\//)
    expect(clearedHeader).not.toMatch(/;\s*Secure/i)
    const gone = await db.select().from(sessions).where(eq(sessions.tokenHash, hashSessionToken(nextToken)))
    expect(gone).toHaveLength(0)
  })

  it.skipIf(!readiness.ok)('renames a project, updates coverage, and deletes it', async () => {
    const app = await appWith(true)
    const owner = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { email: `pdf-${randomUUID()}@example.com` },
    })
    const cookie = cookieOf(owner)
    const boundary = '----phase2pdf'
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nLake\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
        ),
        jpeg,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    })
    expect(created.statusCode).toBe(200)
    const projectId = (created.json() as { id: string }).id

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: 'Renamed lake' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({ title: 'Renamed lake' })

    const recovered = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { coverageRate: 0.03 },
    })
    expect(recovered.statusCode).toBe(200)
    expect(recovered.json()).toMatchObject({ coverageRate: 0.03 })

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}`,
      headers: { cookie },
    })
    expect(removed.statusCode).toBe(204)
  })

  it.skipIf(!readiness.ok)('patches a draft, hides it from another user, and deletes the account', async () => {
    const app = await appWith(true)
    const email = `owner-${randomUUID()}@example.com`
    const owner = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email, name: 'Owner' } })
    const ownerCookie = cookieOf(owner)
    const other = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { email: `other-${randomUUID()}@example.com` },
    })
    const otherCookie = cookieOf(other)

    const boundary = '----phase2'
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nLake\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      jpeg,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    })
    expect(created.statusCode).toBe(200)
    const project = created.json() as { id: string; status: string; colorCount: number }
    expect(project.status).toBe('draft')
    expect(project.colorCount).toBe(24)

    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      payload: { marginMm: 200 },
    })
    expect(bad.statusCode).toBe(400)

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}`,
      headers: { cookie: otherCookie },
    })
    expect(hidden.statusCode).toBe(404)
    const hiddenPatch = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      headers: { cookie: otherCookie, 'content-type': 'application/json' },
      payload: { title: 'Nope' },
    })
    expect(hiddenPatch.statusCode).toBe(404)

    const analysis = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/analysis`,
      headers: { cookie: ownerCookie, 'content-type': 'application/octet-stream', 'x-analysis-key': 'photo:1' },
      payload: Buffer.from('analysis'),
    })
    expect(analysis.statusCode).toBe(200)

    const user = owner.json() as { id: string }
    const folder = path.join(uploadsDirectory(), user.id)
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, 'note.txt'), 'keep')

    const removed = await app.inject({
      method: 'DELETE',
      url: '/api/account',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      payload: { email },
    })
    expect(removed.statusCode).toBe(204)
    const db = getDb()
    const still = await db.select().from(users).where(eq(users.id, user.id))
    expect(still).toHaveLength(0)
    await expect(import('node:fs/promises').then((fs) => fs.stat(folder))).rejects.toThrow()
  })
})

async function databaseReadiness(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return { ok: false, reason: 'DATABASE_URL is not set' }
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString })
  try {
    await client.connect()
    await client.query('select 1')
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'database unavailable' }
  } finally {
    await client.end().catch(() => undefined)
  }
}
