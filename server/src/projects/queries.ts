import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client.js'
import { files, paints, projectColors, projects, type Project, type ProjectColor } from '../db/schema.js'
import { getFileForUser } from '../files/queries.js'
import { deleteStoredFile, saveUserFile } from '../files/store.js'
import type { ProjectColorWrite, ProjectPatch } from './parse.js'
import { validateMergedProject } from './parse.js'

export type ProjectWithColors = {
  project: Project
  colors: ProjectColor[]
}

type SourceUpload = {
  bytes: Uint8Array
  mimeType: string
  originalName: string
}

class ProjectGoneError extends Error {
  constructor() {
    super('Project not found')
    this.name = 'ProjectGoneError'
  }
}

export async function listProjectCards(userId: string): Promise<Array<{ project: Project; palette: string[] }>> {
  const rows = await listProjectsForUser(userId)
  if (rows.length === 0) return []
  const colors = await getDb()
    .select({
      projectId: projectColors.projectId,
      number: projectColors.number,
      hex: projectColors.hex,
    })
    .from(projectColors)
    .where(inArray(projectColors.projectId, rows.map((row) => row.id)))
    .orderBy(asc(projectColors.number))
  const palettes = new Map<string, string[]>()
  for (const color of colors) {
    const palette = palettes.get(color.projectId) ?? []
    if (palette.length < 8) palette.push(color.hex)
    palettes.set(color.projectId, palette)
  }
  return rows.map((project) => ({ project, palette: palettes.get(project.id) ?? [] }))
}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
  return getDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.id))
}

export async function getProjectForUser(userId: string, projectId: string): Promise<ProjectWithColors | null> {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)
  const project = rows[0]
  if (!project) return null

  const colors = await getDb()
    .select()
    .from(projectColors)
    .where(eq(projectColors.projectId, project.id))
    .orderBy(asc(projectColors.number), asc(projectColors.id))
  return { project, colors }
}

async function assignOwnedPaintIds(
  userId: string,
  colors: readonly ProjectColorWrite[],
): Promise<ProjectColorWrite[]> {
  const ids = [...new Set(colors.flatMap((color) => (color.paintId ? [color.paintId] : [])))]
  if (ids.length === 0) {
    return colors.map((color) => ({ ...color, paintId: null }))
  }

  const rows = await getDb()
    .select({ id: paints.id })
    .from(paints)
    .where(and(eq(paints.userId, userId), inArray(paints.id, ids)))
  const owned = new Set(rows.map((row) => row.id))
  return colors.map((color) => ({
    ...color,
    paintId: color.paintId && owned.has(color.paintId) ? color.paintId : null,
  }))
}

function colorValues(projectId: string, colors: readonly ProjectColorWrite[]) {
  return colors.map((color) => ({
    projectId,
    number: color.number,
    hex: color.hex,
    paintId: color.paintId,
    areaCm2: color.areaCm2,
    estimatedQuantity: color.estimatedQuantity,
    shortfall: color.shortfall,
  }))
}

function paperSize(orientation: 'portrait' | 'landscape'): { width: string; height: string } {
  return orientation === 'landscape' ? { width: '297', height: '210' } : { width: '210', height: '297' }
}

export async function createDraftProject(
  userId: string,
  upload: SourceUpload,
  options: { title: string; orientation: 'portrait' | 'landscape' },
): Promise<ProjectWithColors> {
  const saved = await saveUserFile({
    userId,
    kind: 'source_photo',
    originalName: upload.originalName || 'source',
    bytes: upload.bytes,
    mimeType: upload.mimeType,
  })
  const paper = paperSize(options.orientation)
  try {
    return await getDb().transaction(async (tx) => {
      const fileRows = await tx
        .insert(files)
        .values({
          userId,
          kind: 'source_photo',
          storagePath: saved.storagePath,
          mimeType: upload.mimeType,
          byteSize: upload.bytes.byteLength,
        })
        .returning()
      const file = fileRows[0]
      if (!file) throw new Error('Failed to store source photo')
      const projectRows = await tx
        .insert(projects)
        .values({
          userId,
          title: options.title,
          sourceFileId: file.id,
          colorCount: 24,
          detail: 'balanced',
          status: 'draft',
          paperPreset: 'A4',
          paperWidthMm: paper.width,
          paperHeightMm: paper.height,
          orientation: options.orientation,
          marginMm: '10',
          coverageRate: '0.02',
          constrainToOwned: false,
        })
        .returning()
      const project = projectRows[0]
      if (!project) throw new Error('Failed to create project')
      return { project, colors: [] }
    })
  } catch (error) {
    await deleteStoredFile(saved.storagePath)
    throw error
  }
}

export async function patchProjectForUser(
  userId: string,
  projectId: string,
  patch: ProjectPatch,
): Promise<ProjectWithColors | null> {
  const existing = await getProjectForUser(userId, projectId)
  if (!existing) return null
  const current = existing.project
  const nextWidth = patch.paperWidthMm ?? current.paperWidthMm
  const nextHeight = patch.paperHeightMm ?? current.paperHeightMm
  const nextMargin = patch.marginMm ?? current.marginMm
  const merged = validateMergedProject({
    paperPreset: patch.paperPreset ?? current.paperPreset,
    paperWidthMm: nextWidth === null ? null : Number(nextWidth),
    paperHeightMm: nextHeight === null ? null : Number(nextHeight),
    marginMm: nextMargin === null ? null : Number(nextMargin),
  })
  if (!merged.ok) {
    const error = new Error(merged.error)
    error.name = 'ProjectValidationError'
    throw error
  }

  const colors = patch.colors ? await assignOwnedPaintIds(userId, patch.colors) : null

  const updated = await getDb().transaction(async (tx) => {
    const projectRows = await tx
      .update(projects)
      .set({
        title: patch.title ?? current.title,
        colorCount: patch.colorCount ?? current.colorCount,
        detail: patch.detail ?? current.detail,
        paperPreset: patch.paperPreset ?? current.paperPreset,
        paperWidthMm: patch.paperWidthMm ?? current.paperWidthMm,
        paperHeightMm: patch.paperHeightMm ?? current.paperHeightMm,
        orientation: patch.orientation ?? current.orientation,
        marginMm: patch.marginMm ?? current.marginMm,
        coverageRate: patch.coverageRate ?? current.coverageRate,
        cropX: patch.crop === undefined ? current.cropX : patch.crop?.cropX ?? null,
        cropY: patch.crop === undefined ? current.cropY : patch.crop?.cropY ?? null,
        cropWidth: patch.crop === undefined ? current.cropWidth : patch.crop?.cropWidth ?? null,
        cropHeight: patch.crop === undefined ? current.cropHeight : patch.crop?.cropHeight ?? null,
        constrainToOwned: patch.constrainToOwned ?? current.constrainToOwned,
        status: colors ? (colors.length > 0 ? 'ready' : 'draft') : current.status,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .returning()
    const project = projectRows[0]
    if (!project) return null
    if (colors) {
      await tx.delete(projectColors).where(eq(projectColors.projectId, projectId))
      if (colors.length > 0) await tx.insert(projectColors).values(colorValues(projectId, colors))
    }
    const storedColors = colors
      ? await tx
          .select()
          .from(projectColors)
          .where(eq(projectColors.projectId, projectId))
          .orderBy(asc(projectColors.number), asc(projectColors.id))
      : existing.colors
    return { project, colors: storedColors }
  })
  return updated
}

async function ownedFile(userId: string, fileId: string | null) {
  if (!fileId) return null
  return getFileForUser(userId, fileId)
}

export async function replaceProjectSource(
  userId: string,
  projectId: string,
  upload: SourceUpload,
): Promise<ProjectWithColors | null> {
  const existing = await getProjectForUser(userId, projectId)
  if (!existing) return null
  const previous = [
    await ownedFile(userId, existing.project.sourceFileId),
    await ownedFile(userId, existing.project.analysisFileId),
    await ownedFile(userId, existing.project.thumbnailFileId),
  ].filter((file): file is NonNullable<typeof file> => file !== null)
  const saved = await saveUserFile({
    userId,
    kind: 'source_photo',
    originalName: upload.originalName || 'source',
    bytes: upload.bytes,
    mimeType: upload.mimeType,
    replacingBytes: previous.reduce((total, file) => total + file.byteSize, 0),
  })
  try {
    const updated = await getDb().transaction(async (tx) => {
      const fileRows = await tx
        .insert(files)
        .values({
          userId,
          kind: 'source_photo',
          storagePath: saved.storagePath,
          mimeType: upload.mimeType,
          byteSize: upload.bytes.byteLength,
        })
        .returning()
      const file = fileRows[0]
      if (!file) throw new Error('Failed to store source photo')
      const projectRows = await tx
        .update(projects)
        .set({
          sourceFileId: file.id,
          cropX: null,
          cropY: null,
          cropWidth: null,
          cropHeight: null,
          analysisFileId: null,
          analysisKey: null,
          thumbnailFileId: null,
          status: 'draft',
          updatedAt: new Date(),
        })
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        .returning()
      if (!projectRows[0]) throw new ProjectGoneError()
      await tx.delete(projectColors).where(eq(projectColors.projectId, projectId))
      if (previous.length > 0) {
        await tx.delete(files).where(and(inArray(files.id, previous.map((file) => file.id)), eq(files.userId, userId)))
      }
      return { project: projectRows[0], colors: [] }
    })
    for (const file of previous) await deleteStoredFile(file.storagePath)
    return updated
  } catch (error) {
    await deleteStoredFile(saved.storagePath)
    if (error instanceof ProjectGoneError) return null
    throw error
  }
}

async function replaceKindFile(
  userId: string,
  projectId: string,
  upload: { bytes: Uint8Array; mimeType: string; kind: 'analysis' | 'thumbnail'; originalName: string },
  previousId: string | null,
  apply: (fileId: string) => Record<string, unknown>,
): Promise<ProjectWithColors | null> {
  const previous = await ownedFile(userId, previousId)
  const saved = await saveUserFile({
    userId,
    kind: upload.kind,
    originalName: upload.originalName,
    bytes: upload.bytes,
    mimeType: upload.mimeType,
    replacingBytes: previous?.byteSize ?? 0,
  })
  try {
    const updated = await getDb().transaction(async (tx) => {
      const fileRows = await tx
        .insert(files)
        .values({
          userId,
          kind: upload.kind,
          storagePath: saved.storagePath,
          mimeType: upload.mimeType,
          byteSize: upload.bytes.byteLength,
        })
        .returning()
      const file = fileRows[0]
      if (!file) throw new Error('Failed to store file')
      const projectRows = await tx
        .update(projects)
        .set({ ...apply(file.id), updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        .returning()
      const project = projectRows[0]
      if (!project) throw new ProjectGoneError()
      if (previous && previous.id !== file.id) {
        await tx.delete(files).where(and(eq(files.id, previous.id), eq(files.userId, userId)))
      }
      const storedColors = await tx
        .select()
        .from(projectColors)
        .where(eq(projectColors.projectId, projectId))
        .orderBy(asc(projectColors.number), asc(projectColors.id))
      return { project, colors: storedColors }
    })
    if (previous) await deleteStoredFile(previous.storagePath)
    return updated
  } catch (error) {
    await deleteStoredFile(saved.storagePath)
    if (error instanceof ProjectGoneError) return null
    throw error
  }
}

export async function saveProjectAnalysis(
  userId: string,
  projectId: string,
  bytes: Uint8Array,
  analysisKey: string,
): Promise<ProjectWithColors | null> {
  const existing = await getProjectForUser(userId, projectId)
  if (!existing) return null
  return replaceKindFile(
    userId,
    projectId,
    { bytes, mimeType: 'application/octet-stream', kind: 'analysis', originalName: 'analysis.bin' },
    existing.project.analysisFileId,
    (fileId) => ({ analysisFileId: fileId, analysisKey }),
  )
}

export async function saveProjectThumbnail(
  userId: string,
  projectId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<ProjectWithColors | null> {
  const existing = await getProjectForUser(userId, projectId)
  if (!existing) return null
  return replaceKindFile(
    userId,
    projectId,
    { bytes, mimeType, kind: 'thumbnail', originalName: 'thumbnail' },
    existing.project.thumbnailFileId,
    (fileId) => ({ thumbnailFileId: fileId }),
  )
}

export function isProjectValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ProjectValidationError'
}

export async function deleteProjectForUser(userId: string, projectId: string): Promise<boolean> {
  const existing = await getProjectForUser(userId, projectId)
  if (!existing) return false

  const ids = [
    existing.project.sourceFileId,
    existing.project.analysisFileId,
    existing.project.thumbnailFileId,
  ].filter((id): id is string => typeof id === 'string')
  const stored: Array<NonNullable<Awaited<ReturnType<typeof getFileForUser>>>> = []
  for (const id of ids) {
    const file = await getFileForUser(userId, id)
    if (file) stored.push(file)
  }

  await getDb().transaction(async (tx) => {
    await tx.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    if (stored.length > 0) {
      await tx.delete(files).where(and(inArray(files.id, stored.map((file) => file.id)), eq(files.userId, userId)))
    }
  })

  for (const file of stored) await deleteStoredFile(file.storagePath)
  return true
}
