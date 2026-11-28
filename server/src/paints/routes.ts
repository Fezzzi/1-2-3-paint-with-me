import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSessionUser } from '../auth/session.js'
import { isUuid } from '../ids.js'
import { paintsToCsv, parseCsvPaints } from './csv.js'
import { toCsvPaint, toExportJson, toPaintJson } from './json.js'
import { detectImage, imageMatchesMime } from '../files/magic.js'
import { isReferenceImageMime, MAX_REFERENCE_IMAGE_BYTES } from './limits.js'
import { parseCreateBody, parseImportRecords, parsePatchBody } from './parse.js'
import {
  createPaintForUser,
  deletePaintForUser,
  getPaintForUser,
  importPaintsForUser,
  listPaintsForUser,
  setPaintReferenceForUser,
  updatePaintForUser,
} from './queries.js'

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request, reply)
  if (!user) {
    await reply.code(401).send({ error: 'Unauthorized' })
    return null
  }
  return user
}

function paintId(request: FastifyRequest): string | null {
  const params = request.params
  if (!params || typeof params !== 'object' || !('id' in params)) return null
  const id = params.id
  return typeof id === 'string' && isUuid(id) ? id : null
}

function exportFormat(request: FastifyRequest): 'json' | 'csv' | 'invalid' {
  const query = request.query
  if (!query || typeof query !== 'object' || !('format' in query)) return 'json'
  const format = query.format
  if (format === undefined) return 'json'
  if (format === 'json' || format === 'csv') return format
  return 'invalid'
}

function contentType(request: FastifyRequest): string {
  const header = request.headers['content-type']
  const value = Array.isArray(header) ? header[0] : header
  return value?.split(';')[0]?.trim().toLowerCase() ?? ''
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return undefined
}

function sendUploadError(reply: FastifyReply, error: unknown) {
  const code = errorCode(error)
  if (code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ error: 'File too large' })
  }
  if (
    code === 'FST_INVALID_MULTIPART_CONTENT_TYPE' ||
    code === 'FST_FILES_LIMIT' ||
    code === 'FST_PARTS_LIMIT' ||
    code === 'FST_FIELDS_LIMIT'
  ) {
    return reply.code(400).send({ error: 'Expected a multipart file' })
  }
  throw error
}

const UPLOAD_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }

export async function registerPaintRoutes(app: FastifyInstance) {
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body)
  })

  app.get('/api/paints/export', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return

    const format = exportFormat(request)
    if (format === 'invalid') return reply.code(400).send({ error: 'Invalid format' })

    const rows = await listPaintsForUser(user.id)
    if (format === 'csv') {
      return reply
        .header('Content-Disposition', 'attachment; filename="paints.csv"')
        .type('text/csv; charset=utf-8')
        .send(paintsToCsv(rows.map(toCsvPaint)))
    }

    return reply
      .header('Content-Disposition', 'attachment; filename="paints.json"')
      .type('application/json; charset=utf-8')
      .send(rows.map(toExportJson))
  })

  app.post('/api/paints/import', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return

    const type = contentType(request)
    let parsed
    if (type === 'application/json') {
      parsed = parseImportRecords(request.body)
    } else if (type === 'text/csv') {
      if (typeof request.body !== 'string') return reply.code(400).send({ error: 'Invalid CSV' })
      parsed = parseCsvPaints(request.body)
    } else {
      return reply.code(415).send({ error: 'Unsupported media type' })
    }

    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    const imported = await importPaintsForUser(user.id, parsed.value)
    return { imported }
  })

  app.get('/api/paints', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const rows = await listPaintsForUser(user.id)
    return rows.map(toPaintJson)
  })

  app.post('/api/paints', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const parsed = parseCreateBody(request.body ?? {})
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    const paint = await createPaintForUser(user.id, parsed.value)
    return toPaintJson(paint)
  })

  app.get('/api/paints/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = paintId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const paint = await getPaintForUser(user.id, id)
    if (!paint) return reply.code(404).send({ error: 'Not found' })
    return toPaintJson(paint)
  })

  app.patch('/api/paints/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = paintId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const parsed = parsePatchBody(request.body ?? {})
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error })
    const paint = await updatePaintForUser(user.id, id, parsed.value)
    if (!paint) return reply.code(404).send({ error: 'Not found' })
    return toPaintJson(paint)
  })

  app.delete('/api/paints/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = paintId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    const deleted = await deletePaintForUser(user.id, id)
    if (!deleted) return reply.code(404).send({ error: 'Not found' })
    return reply.code(204).send()
  })

  app.post('/api/paints/:id/reference', UPLOAD_LIMIT, async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return
    const id = paintId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })
    if (!request.isMultipart()) return reply.code(400).send({ error: 'Expected a multipart file' })

    let part
    try {
      part = await request.file()
    } catch (error) {
      return sendUploadError(reply, error)
    }
    if (!part || part.fieldname !== 'file') {
      if (part) await part.toBuffer().catch(() => undefined)
      return reply.code(400).send({ error: 'Missing file' })
    }

    const rawMime = part.mimetype.split(';')[0]?.trim().toLowerCase() ?? ''
    const mimeType = rawMime === 'image/jpg' || rawMime === 'image/pjpeg' ? 'image/jpeg' : rawMime
    if (!isReferenceImageMime(mimeType)) {
      await part.toBuffer().catch(() => undefined)
      return reply.code(400).send({ error: 'Unsupported image type' })
    }

    let bytes: Buffer
    try {
      bytes = await part.toBuffer()
    } catch (error) {
      return sendUploadError(reply, error)
    }

    const truncated = 'truncated' in part.file && part.file.truncated === true
    if (truncated || bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
      return reply.code(413).send({ error: 'File too large' })
    }
    const detected = detectImage(bytes)
    if (bytes.byteLength === 0 || !detected || !imageMatchesMime(detected, mimeType)) {
      return reply.code(400).send({ error: bytes.byteLength === 0 ? 'Missing file' : 'Unsupported image type' })
    }

    const paint = await setPaintReferenceForUser({
      userId: user.id,
      paintId: id,
      bytes,
      mimeType,
      originalName: part.filename,
    })
    if (!paint) return reply.code(404).send({ error: 'Not found' })
    return toPaintJson(paint)
  })
}
