import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db/client.js'
import { paints, users } from '../db/schema.js'
import { listPaintsForUser } from './queries.js'

const readiness = await databaseReadiness()
if (!readiness.ok) {
  console.warn(`Skipping paint ownership test: ${readiness.reason}`)
}

describe('paint ownership', () => {
  afterAll(async () => {
    await closeDb()
  })

  it.skipIf(!readiness.ok)(
    readiness.ok
      ? 'scopes paints to the signed-in user'
      : `scopes paints to the signed-in user (skipped: ${readiness.reason})`,
    async () => {
      const db = getDb()
      const stamp = randomUUID()
      const insertedUsers = await db
        .insert(users)
        .values([
          {
            googleSub: `ownership-a-${stamp}`,
            email: `ownership-a-${stamp}@example.com`,
            displayName: 'User A',
          },
          {
            googleSub: `ownership-b-${stamp}`,
            email: `ownership-b-${stamp}@example.com`,
            displayName: 'User B',
          },
        ])
        .returning()
      const userA = insertedUsers[0]
      const userB = insertedUsers[1]
      if (!userA || !userB) throw new Error('Failed to insert users')

      try {
        const insertedPaints = await db
          .insert(paints)
          .values({
            userId: userA.id,
            label: `owned-by-a-${stamp}`,
            manufacturer: 'Ownership test',
          })
          .returning()
        const paint = insertedPaints[0]
        if (!paint) throw new Error('Failed to insert paint')

        const asUserB = await listPaintsForUser(userB.id)
        expect(asUserB.some((row) => row.id === paint.id)).toBe(false)
        expect(asUserB.some((row) => row.userId === userA.id)).toBe(false)

        const asUserA = await listPaintsForUser(userA.id)
        expect(asUserA.some((row) => row.id === paint.id && row.userId === userA.id)).toBe(true)
      } finally {
        await db.delete(users).where(inArray(users.id, [userA.id, userB.id]))
      }
    },
  )
})

async function databaseReadiness(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return { ok: false, reason: 'DATABASE_URL is not set' }
  }

  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    max: 1,
  })
  try {
    await pool.query('select 1')
    return { ok: true }
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'connection failed'
    if (code === '28P01') {
      return {
        ok: false,
        reason: 'database authentication failed (28P01); Postgres is reachable but rejected DATABASE_URL',
      }
    }
    return { ok: false, reason: `database connection failed (${code})` }
  } finally {
    await pool.end().catch(() => undefined)
  }
}
