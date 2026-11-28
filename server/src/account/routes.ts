import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { clearSessionCookie, getSessionUser } from '../auth/session.js'
import { getDb } from '../db/client.js'
import { users } from '../db/schema.js'
import { deleteUserFiles } from '../files/store.js'

export async function registerAccountRoutes(app: FastifyInstance) {
  app.delete(
    '/api/account',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const user = await getSessionUser(request, reply)
      if (!user) return reply.code(401).send({ error: 'Unauthorized' })
      const body = request.body
      const email = body && typeof body === 'object' && 'email' in body ? body.email : undefined
      if (typeof email !== 'string' || email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        return reply.code(400).send({ error: 'Email does not match' })
      }

      await getDb().delete(users).where(eq(users.id, user.id))
      await deleteUserFiles(user.id).catch((error: unknown) => {
        console.error(`Could not delete uploads for ${user.id}`, error instanceof Error ? error.message : 'failed')
      })
      clearSessionCookie(reply)
      return reply.code(204).send()
    },
  )
}
