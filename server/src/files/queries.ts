import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { files, type StoredFile } from '../db/schema.js'

export async function getFileForUser(userId: string, fileId: string): Promise<StoredFile | null> {
  const rows = await getDb()
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}
