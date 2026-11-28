import { createHash, randomBytes } from 'node:crypto'
import '@fastify/cookie'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { loadConfig } from '../config.js'
import { getDb } from '../db/client.js'
import { sessions, users, type User } from '../db/schema.js'

export const SESSION_COOKIE = 'session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const ROLL_AFTER_MS = 24 * 60 * 60 * 1000

export type PublicUser = {
  id: string
  email: string
  displayName: string | null
  photoUrl: string | null
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionCookieOptions() {
  const config = loadConfig()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
    maxAge: SESSION_MS / 1000,
  }
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_MS),
    lastSeenAt: now,
  })
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, sessionCookieOptions())
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE]
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
  }
  clearSessionCookie(reply)
}

export async function getSessionUser(request: FastifyRequest, reply?: FastifyReply): Promise<User | null> {
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return null

  const db = getDb()
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  const now = new Date()
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id))
    return null
  }

  if (now.getTime() - row.session.lastSeenAt.getTime() > ROLL_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MS) })
      .where(eq(sessions.id, row.session.id))
    reply?.setCookie(SESSION_COOKIE, token, sessionCookieOptions())
  }

  return row.user
}
