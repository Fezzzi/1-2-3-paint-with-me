import type { FastifyInstance } from 'fastify'
import { OAuth2Client } from 'google-auth-library'
import { eq } from 'drizzle-orm'
import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { users, type User } from '../db/schema.js'
import { createSession, destroySession, getSessionUser, toPublicUser } from './session.js'

const AUTH_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

function readCredential(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('credential' in body)) return null
  const credential = body.credential
  return typeof credential === 'string' && credential.length > 0 ? credential : null
}

function emailVerified(value: unknown): boolean {
  return value === true || value === 'true'
}

export async function upsertUser(profile: {
  googleSub: string
  email: string
  displayName: string | null
  photoUrl: string | null
}): Promise<User> {
  const db = getDb()
  const existing = await db.select().from(users).where(eq(users.googleSub, profile.googleSub)).limit(1)

  if (!existing[0]) {
    const inserted = await db
      .insert(users)
      .values({
        googleSub: profile.googleSub,
        email: profile.email,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
      })
      .returning()
    const user = inserted[0]
    if (!user) throw new Error('Failed to create user')
    return user
  }

  const updated = await db
    .update(users)
    .set({
      email: profile.email,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing[0].id))
    .returning()
  const user = updated[0]
  if (!user) throw new Error('Failed to update user')
  return user
}

function readDevLogin(body: unknown): { email: string; name: string } | null {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const email = record.email === undefined ? 'dev@example.com' : record.email
  const name = record.name === undefined ? 'Dev User' : record.name
  if (typeof email !== 'string' || typeof name !== 'string') return null
  const trimmedEmail = email.trim().toLowerCase()
  const trimmedName = name.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || trimmedEmail.length > 200) return null
  if (trimmedName.length === 0 || trimmedName.length > 200) return null
  return { email: trimmedEmail, name: trimmedName }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const config = loadConfig()

  app.get('/api/auth/config', async () => ({
    googleClientId: config.googleClientId,
    devLoginEnabled: config.devLoginEnabled,
  }))

  app.post('/api/auth/google', AUTH_LIMIT, async (request, reply) => {
    const clientId = loadConfig().googleClientId
    const credential = readCredential(request.body)
    if (!clientId || !credential) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    let payload
    try {
      const client = new OAuth2Client(clientId)
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
      payload = ticket.getPayload()
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    if (!payload?.sub || !payload.email || !emailVerified(payload.email_verified)) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const user = await upsertUser({
      googleSub: payload.sub,
      email: payload.email,
      displayName: payload.name ?? null,
      photoUrl: payload.picture ?? null,
    })
    await createSession(reply, user.id)
    return toPublicUser(user)
  })

  if (config.devLoginEnabled) {
    app.post('/api/auth/dev-login', AUTH_LIMIT, async (request, reply) => {
      const body = readDevLogin(request.body ?? {})
      if (!body) return reply.code(400).send({ error: 'Invalid email' })
      const user = await upsertUser({
        googleSub: `dev:${body.email}`,
        email: body.email,
        displayName: body.name,
        photoUrl: null,
      })
      await createSession(reply, user.id)
      return toPublicUser(user)
    })
  }

  app.post('/api/auth/logout', AUTH_LIMIT, async (request, reply) => {
    await destroySession(request, reply)
    return reply.code(204).send()
  })

  app.get('/api/auth/me', async (request, reply) => {
    const user = await getSessionUser(request, reply)
    if (!user) return reply.code(401).send({ error: 'Unauthorized' })
    return toPublicUser(user)
  })
}
