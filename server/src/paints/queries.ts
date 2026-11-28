import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { files, paints, type Paint } from '../db/schema.js'
import { getFileForUser } from '../files/queries.js'
import { deleteStoredFile, saveUserFile } from '../files/store.js'
import type { PaintWrite } from './parse.js'

export async function listPaintsForUser(userId: string): Promise<Paint[]> {
  return getDb()
    .select()
    .from(paints)
    .where(eq(paints.userId, userId))
    .orderBy(desc(paints.updatedAt), desc(paints.id))
}

export async function getPaintForUser(userId: string, paintId: string): Promise<Paint | null> {
  const rows = await getDb()
    .select()
    .from(paints)
    .where(and(eq(paints.id, paintId), eq(paints.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createPaintForUser(userId: string, input: PaintWrite): Promise<Paint> {
  const rows = await getDb()
    .insert(paints)
    .values({
      userId,
      manufacturer: input.manufacturer,
      productLine: input.productLine,
      manufacturerCode: input.manufacturerCode,
      label: input.label,
      hex: input.hex,
      quantityOnHand: input.quantityOnHand,
      unit: input.unit,
      notes: input.notes,
    })
    .returning()
  const paint = rows[0]
  if (!paint) throw new Error('Failed to create paint')
  return paint
}

export async function updatePaintForUser(
  userId: string,
  paintId: string,
  patch: Partial<PaintWrite>,
): Promise<Paint | null> {
  const existing = await getPaintForUser(userId, paintId)
  if (!existing) return null
  if (Object.keys(patch).length === 0) return existing

  const rows = await getDb()
    .update(paints)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(and(eq(paints.id, paintId), eq(paints.userId, userId)))
    .returning()
  return rows[0] ?? null
}

export async function importPaintsForUser(userId: string, rows: readonly PaintWrite[]): Promise<number> {
  if (rows.length === 0) return 0
  await getDb()
    .insert(paints)
    .values(
      rows.map((row) => ({
        userId,
        manufacturer: row.manufacturer,
        productLine: row.productLine,
        manufacturerCode: row.manufacturerCode,
        label: row.label,
        hex: row.hex,
        quantityOnHand: row.quantityOnHand,
        unit: row.unit,
        notes: row.notes,
      })),
    )
  return rows.length
}

export async function deletePaintForUser(userId: string, paintId: string): Promise<boolean> {
  const paint = await getPaintForUser(userId, paintId)
  if (!paint) return false

  const previous = paint.referenceFileId ? await getFileForUser(userId, paint.referenceFileId) : null
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.delete(paints).where(and(eq(paints.id, paintId), eq(paints.userId, userId)))
    if (previous) {
      await tx
        .delete(files)
        .where(and(eq(files.id, previous.id), eq(files.userId, userId)))
    }
  })

  if (previous) await deleteStoredFile(previous.storagePath)
  return true
}

export async function setPaintReferenceForUser(input: {
  userId: string
  paintId: string
  bytes: Uint8Array
  mimeType: string
  originalName: string
}): Promise<Paint | null> {
  const paint = await getPaintForUser(input.userId, input.paintId)
  if (!paint) return null
  const previous = paint.referenceFileId ? await getFileForUser(input.userId, paint.referenceFileId) : null

  const saved = await saveUserFile({
    userId: input.userId,
    kind: 'paint_reference',
    originalName: input.originalName || 'reference',
    bytes: input.bytes,
    mimeType: input.mimeType,
    replacingBytes: previous?.byteSize ?? 0,
  })

  const db = getDb()
  let storedId: string
  try {
    const inserted = await db
      .insert(files)
      .values({
        userId: input.userId,
        kind: 'paint_reference',
        storagePath: saved.storagePath,
        mimeType: input.mimeType,
        byteSize: input.bytes.byteLength,
      })
      .returning()
    const stored = inserted[0]
    if (!stored) throw new Error('Failed to store reference file')
    storedId = stored.id
  } catch (error) {
    await deleteStoredFile(saved.storagePath)
    throw error
  }

  const updated = await db
    .update(paints)
    .set({
      referenceFileId: storedId,
      updatedAt: new Date(),
    })
    .where(and(eq(paints.id, input.paintId), eq(paints.userId, input.userId)))
    .returning()
  const next = updated[0]
  if (!next) {
    await db.delete(files).where(and(eq(files.id, storedId), eq(files.userId, input.userId)))
    await deleteStoredFile(saved.storagePath)
    return null
  }

  if (paint.referenceFileId && paint.referenceFileId !== storedId && previous) {
    await db.delete(files).where(and(eq(files.id, previous.id), eq(files.userId, input.userId)))
    await deleteStoredFile(previous.storagePath)
  }

  return next
}
