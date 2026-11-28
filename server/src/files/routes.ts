import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSessionUser } from '../auth/session.js'
import { isUuid } from '../ids.js'
import { isMissingR2Object } from './r2.js'
import { openStoredFile } from './store.js'
import { getFileForUser } from './queries.js'

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request, reply)
  if (!user) {
    await reply.code(401).send({ error: 'Unauthorized' })
    return null
  }
  return user
}

function fileId(request: FastifyRequest): string | null {
  const params = request.params
  if (!params || typeof params !== 'object' || !('id' in params)) return null
  const id = params.id
  return typeof id === 'string' && isUuid(id) ? id : null
}

function isMissingFile(error: unknown): boolean {
  if (isMissingR2Object(error)) return true
  if (error instanceof Error && error.message === 'Invalid storage path') return true
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.get('/api/files/:id', async (request, reply) => {
    const user = await requireUser(request, reply)
    if (!user) return

    const id = fileId(request)
    if (!id) return reply.code(404).send({ error: 'Not found' })

    const file = await getFileForUser(user.id, id)
    if (!file) return reply.code(404).send({ error: 'Not found' })

    try {
      const stream = await openStoredFile(file.storagePath)
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Cache-Control', 'private, max-age=31536000, immutable')
      return reply.type(file.mimeType).send(stream)
    } catch (error) {
      if (isMissingFile(error)) return reply.code(404).send({ error: 'Not found' })
      throw error
    }
  })
}
