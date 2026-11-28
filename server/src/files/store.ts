import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { sql, eq } from 'drizzle-orm'
import { r2Config, type R2Config } from '../config.js'
import { getDb } from '../db/client.js'
import { files } from '../db/schema.js'
import { storageLimits, storageWouldExceed, StorageLimitError } from './quota.js'
import { assertR2Ready, deleteR2Object, deleteR2Prefix, isMissingR2Object, openR2Object, putR2Object } from './r2.js'

export function uploadsDirectory(): string {
  const configured = process.env.UPLOADS_DIR?.trim()
  if (configured) return path.resolve(configured)
  return path.resolve(process.cwd(), 'uploads')
}

const FILE_KINDS = ['source_photo', 'paint_reference', 'analysis', 'thumbnail'] as const

export type FileKind = (typeof FILE_KINDS)[number]

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/octet-stream': '.bin',
}

export type SaveUserFileInput = {
  userId: string
  kind: FileKind
  originalName: string
  bytes: Uint8Array
  mimeType: string
  replacingBytes?: number
}

export type SavedUserFile = {
  absolutePath: string
  storagePath: string
}

export async function saveUserFile(input: SaveUserFileInput): Promise<SavedUserFile> {
  assertSafeUserId(input.userId)
  assertFileKind(input.kind)
  // The client filename is never used for the stored name.
  void input.originalName

  const filename = `${randomUUID()}${extensionForMime(input.mimeType)}`
  const storagePath = `${input.userId}/${filename}`
  const remote = r2Config(process.env)
  await assertStorageQuota(input.userId, input.bytes.byteLength, input.replacingBytes ?? 0, remote !== null)
  if (remote) {
    await putR2Object(remote, storagePath, input.bytes, input.mimeType)
    return { absolutePath: storagePath, storagePath }
  }

  const absolutePath = resolveStoredPath(storagePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, input.bytes)
  return { absolutePath, storagePath }
}

export async function openStoredFile(storagePath: string): Promise<Readable> {
  const key = assertStorageKey(storagePath)
  const remote = r2Config(process.env)
  if (remote) return openR2Object(remote, key)
  return createReadStream(resolveStoredPath(key))
}

export function resolveStoredPath(storagePath: string): string {
  const key = assertStorageKey(storagePath)
  const root = uploadsDirectory()
  const absolutePath = path.resolve(root, ...key.split('/'))
  const relative = path.relative(root, absolutePath)
  const relativeSegments = relative.split(/[/\\]/)
  if (relative === '' || path.isAbsolute(relative) || relativeSegments.includes('..')) {
    throw new Error('Invalid storage path')
  }
  return absolutePath
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  const key = assertStorageKey(storagePath)
  const remote = r2Config(process.env)
  if (remote) {
    try {
      await deleteR2Object(remote, key)
    } catch (error) {
      if (isMissingR2Object(error)) return
      console.error(`Could not delete stored file ${storagePath}`)
    }
    return
  }

  try {
    await unlink(resolveStoredPath(key))
  } catch (error) {
    if (isErrno(error) && error.code === 'ENOENT') return
    console.error(`Could not delete stored file ${storagePath}`)
  }
}

export async function deleteUserFiles(userId: string): Promise<void> {
  assertSafeUserId(userId)
  const remote = r2Config(process.env)
  if (remote) await deleteR2Prefix(remote, `${userId}/`)
  await rm(path.join(uploadsDirectory(), userId), { recursive: true, force: true })
}

export async function assertStorageReady(remote: R2Config | null): Promise<void> {
  if (remote) {
    await assertR2Ready(remote)
    return
  }
  const uploads = uploadsDirectory()
  await mkdir(uploads, { recursive: true })
  const probe = path.join(uploads, `.ready-${randomUUID()}`)
  await writeFile(probe, 'ok')
  await unlink(probe)
}

export function assertStorageKey(storagePath: string): string {
  if (typeof storagePath !== 'string' || storagePath.length === 0) {
    throw new Error('Invalid storage path')
  }
  if (path.isAbsolute(storagePath)) {
    throw new Error('Invalid storage path')
  }
  const segments = storagePath.split(/[/\\]/)
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Invalid storage path')
  }
  return segments.join('/')
}

async function assertStorageQuota(userId: string, incoming: number, replacing: number, r2Enabled: boolean): Promise<void> {
  const limits = storageLimits(process.env, r2Enabled)
  if (limits.userBytes !== null) {
    const used = await storedBytes(userId)
    if (storageWouldExceed(used, incoming, replacing, limits.userBytes)) {
      throw new StorageLimitError('Your storage is full. Delete a project or a paint photo and try again.')
    }
  }
  if (limits.accountBytes !== null) {
    const used = await storedBytes()
    if (storageWouldExceed(used, incoming, replacing, limits.accountBytes)) {
      throw new StorageLimitError('Storage is full right now. Try again later.')
    }
  }
}

async function storedBytes(userId?: string): Promise<number> {
  const query = getDb()
    .select({ bytes: sql<string>`coalesce(sum(${files.byteSize}), 0)` })
    .from(files)
  const rows = userId ? await query.where(eq(files.userId, userId)) : await query
  return Number(rows[0]?.bytes ?? 0)
}

function assertSafeUserId(userId: string): void {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(userId)) {
    throw new Error('Invalid user id')
  }
}

function assertFileKind(kind: string): asserts kind is FileKind {
  if (!FILE_KINDS.includes(kind as FileKind)) {
    throw new Error('Invalid file kind')
  }
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  const mapped = MIME_EXTENSIONS[normalized]
  if (mapped) return mapped

  const subtype = normalized.split('/')[1] ?? ''
  if (/^[a-z0-9]{1,8}$/.test(subtype)) return `.${subtype}`
  return '.bin'
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
