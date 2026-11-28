import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSessionUser } from '../auth/session.js'
import { detectImage, imageMatchesMime } from '../files/magic.js'
import { isUuid } from '../ids.js'
import { toProjectJson, toProjectListJson } from './json.js'
import {
  isSourcePhotoMime,
  MAX_SOURCE_PHOTO_BYTES,
  normalizeSourcePhotoMime,
} from './limits.js'
import { parseProjectPatch } from './parse.js'
import {
  createDraftProject,
  deleteProjectForUser,
  getProjectForUser,
  isProjectValidationError,
  listProjectCards,
  patchProjectForUser,
  replaceProjectSource,
  saveProjectAnalysis,
  saveProjectThumbnail,
} from './queries.js'

const UPLOAD_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }
const MAX_ANALYSIS_BYTES = 4 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 600 * 1024
const ANALYSIS_KEY_MAX = 200

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request, reply)
  if (!user) {
    await reply.code(401).send({ error: 'Unauthorized' })
    return null
  }
  return user
}

function projectId(request: FastifyRequest): string | null {
  const params = request.params
  if (!params || typeof params !== 'object' || !('id' in params)) return null
  const id = params.id
  return typeof id === 'string' && isUuid(id) ? id : null
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

function isTooLarge(error: unknown): boolean {
  return errorCode(error) === 'FST_REQ_FILE_TOO_LARGE'
}

function sendUploadError(reply: FastifyReply, error: unknown) {
  if (isTooLarge(error)) return reply.code(413).send({ error: 'File too large' })
  const code = errorCode(error)
  if (
    code === 'FST_INVALID_MULTIPART_CONTENT_TYPE' ||
    code === 'FST_FILES_LIMIT' ||
    code === 'FST_PARTS_LIMIT' ||
    code === 'FST_FIELDS_LIMIT'
  ) {
    return reply.code(400).send({ error: 'Expected multipart form data' })
  }
  throw error
}

function headerValue(request: FastifyRequest, name: string): string {
  const value = request.headers[name]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function contentType(request: FastifyRequest): string {
  return headerValue(request, 'content-type').split(';')[0]?.trim().toLowerCase() ?? ''
}

async function readSourcePart(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ bytes: Buffer; mimeType: string; originalName: string; fields: Record<string, string> } | null> {
  if (!request.isMultipart()) {
    await reply.code(400).send({ error: 'Expected multipart form data' })
    return null
  }

  let file: { bytes: Buffer; mimeType: string; originalName: string } | null = null
  let fileProblem: 'type' | 'empty' | 'large' | null = null
  const fields: Record<string, string> = {}

  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || file || fileProblem) {
          await part.toBuffer().catch(() => undefined)
          continue
        }
        const mimeType = normalizeSourcePhotoMime(part.mimetype)
        let bytes: Buffer
        try {
          bytes = await part.toBuffer()
        } catch (error) {
          if (isTooLarge(error)) {
            fileProblem = 'large'
            continue
          }
          throw error
        }
        const truncated = 'truncated' in part.file && part.file.truncated === true
        if (truncated || bytes.byteLength > MAX_SOURCE_PHOTO_BYTES) {
          fileProblem = 'large'
          continue
        }
        const detected = detectImage(bytes)
        if (!isSourcePhotoMime(mimeType) || !detected || !imageMatchesMime(detected, mimeType)) {
          fileProblem = 'type'
          continue
        }
        if (bytes.byteLength === 0) {
          fileProblem = 'empty'
          continue
        }
        file = { bytes, mimeType, originalName: part.filename || 'source' }
        continue
      }
      if (typeof part.value === 'string' && !part.valueTruncated) fields[part.fieldname] = part.value
    }
  } catch (error) {
    await sendUploadError(reply, error)
    return null
  }

  if (fileProblem === 'large') {
    await reply.code(413).send({ error: 'File too large' })
    return null
  }
  if (fileProblem === 'type' || !file) {
    await reply.code(400).send({ error: fileProblem === 'type' ? 'Unsupported image type' : 'Missing file' })
    return null
  }
  return { ...file, fields }
}

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get('/api/projects', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const rows = await listProjectCards(user.id)
    return rows.map((row) => toProjectListJson(row.project, row.palette))
  })

  app.post('/api/projects', UPLOAD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const upload = await readSourcePart(request, reply)
    if (!upload) return
    const title = upload.fields.title?.trim() || 'Untitled project'
    if (title.length > 200) return reply.code(400).send({ error: 'Title is too long' })
    const orientation = upload.fields.orientation === 'landscape' ? 'landscape' : 'portrait'
    if (upload.fields.orientation && upload.fields.orientation !== 'portrait' && upload.fields.orientation !== 'landscape') {
      return reply.code(400).send({ error: 'Invalid orientation' })
    }
    const created = await createDraftProject(user.id, upload, { title, orientation })
    return toProjectJson(created.project, created.colors)
  })

  app.get('/api/projects/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const found = await getProjectForUser(user.id, id)
    if (!found) return reply.code(404).send({ error: 'Not found' })
    return toProjectJson(found.project, found.colors)
  })

  app.patch('/api/projects/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const parsed = parseProjectPatch(request.body)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    try {
      const updated = await patchProjectForUser(user.id, id, parsed.value)
      if (!updated) return reply.code(404).send({ error: 'Not found' })
      return toProjectJson(updated.project, updated.colors)
    } catch (error) {
      if (isProjectValidationError(error)) return reply.code(400).send({ error: error.message })
      throw error
    }
  })

  app.put('/api/projects/:id/source', UPLOAD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const upload = await readSourcePart(request, reply)
    if (!upload) return
    const updated = await replaceProjectSource(user.id, id, upload)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return toProjectJson(updated.project, updated.colors)
  })

  app.put('/api/projects/:id/analysis', { ...UPLOAD_LIMIT, bodyLimit: MAX_ANALYSIS_BYTES }, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    if (contentType(request) !== 'application/octet-stream' || !Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: 'Expected analysis bytes' })
    }
    const key = headerValue(request, 'x-analysis-key')
    if (!key || key.length > ANALYSIS_KEY_MAX) return reply.code(400).send({ error: 'Invalid analysis key' })
    if (request.body.byteLength === 0 || request.body.byteLength > MAX_ANALYSIS_BYTES) {
      return reply.code(request.body.byteLength > MAX_ANALYSIS_BYTES ? 413 : 400).send({
        error: request.body.byteLength > MAX_ANALYSIS_BYTES ? 'File too large' : 'Missing file',
      })
    }
    const updated = await saveProjectAnalysis(user.id, id, request.body, key)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return toProjectJson(updated.project, updated.colors)
  })

  app.put('/api/projects/:id/thumbnail', { ...UPLOAD_LIMIT, bodyLimit: MAX_THUMBNAIL_BYTES }, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const mimeType = normalizeSourcePhotoMime(contentType(request))
    if (!Buffer.isBuffer(request.body) || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return reply.code(400).send({ error: 'Unsupported image type' })
    }
    const detected = detectImage(request.body)
    if (!detected || !imageMatchesMime(detected, mimeType)) {
      return reply.code(400).send({ error: 'Unsupported image type' })
    }
    if (request.body.byteLength > MAX_THUMBNAIL_BYTES) return reply.code(413).send({ error: 'File too large' })
    const updated = await saveProjectThumbnail(user.id, id, request.body, mimeType)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return toProjectJson(updated.project, updated.colors)
  })

  app.delete('/api/projects/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = projectId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const deleted = await deleteProjectForUser(user.id, id)
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })
}
