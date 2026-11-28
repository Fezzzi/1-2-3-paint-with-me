import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '../db/client.js'
import { projects, users } from '../db/schema.js'
import { getProjectForUser, listProjectsForUser } from './queries.js'

const readiness = await databaseReadiness()
if (!readiness.ok) {
  console.warn(`Skipping project ownership test: ${readiness.reason}`)
}

describe('project ownership', () => {
  afterAll(async () => {
    await closeDb()
  })

  it.skipIf(!readiness.ok)(
    readiness.ok
      ? 'scopes projects to the signed-in user'
      : `scopes projects to the signed-in user (skipped: ${readiness.reason})`,
    async () => {
      const db = getDb()
      const stamp = randomUUID()
      const insertedUsers = await db
        .insert(users)
        .values([
          {
            googleSub: `project-ownership-a-${stamp}`,
            email: `project-ownership-a-${stamp}@example.com`,
            displayName: 'User A',
          },
          {
            googleSub: `project-ownership-b-${stamp}`,
            email: `project-ownership-b-${stamp}@example.com`,
            displayName: 'User B',
          },
        ])
        .returning()
      const userA = insertedUsers[0]
      const userB = insertedUsers[1]
      if (!userA || !userB) throw new Error('Failed to insert users')

      try {
        const insertedProjects = await db
          .insert(projects)
          .values({
            userId: userA.id,
            title: `owned-by-a-${stamp}`,
            colorCount: 12,
            orientation: 'portrait',
          })
          .returning()
        const project = insertedProjects[0]
        if (!project) throw new Error('Failed to insert project')

        const listedAsB = await listProjectsForUser(userB.id)
        expect(listedAsB.some((row) => row.id === project.id)).toBe(false)
        expect(listedAsB.some((row) => row.userId === userA.id)).toBe(false)
        expect(await getProjectForUser(userB.id, project.id)).toBeNull()

        const listedAsA = await listProjectsForUser(userA.id)
        expect(listedAsA.some((row) => row.id === project.id && row.userId === userA.id)).toBe(true)
        const visible = await getProjectForUser(userA.id, project.id)
        expect(visible?.project.id).toBe(project.id)
        expect(visible?.project.userId).toBe(userA.id)
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
