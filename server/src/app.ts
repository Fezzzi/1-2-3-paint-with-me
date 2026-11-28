import path from 'node:path'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { registerAccountRoutes } from './account/routes.js'
import { registerAuthRoutes } from './auth/routes.js'
import { loadConfig } from './config.js'
import { getPool } from './db/client.js'
import { assertStorageReady } from './files/store.js'
import { registerFileRoutes } from './files/routes.js'
import { MAX_REFERENCE_IMAGE_BYTES } from './paints/limits.js'
import { registerPaintRoutes } from './paints/routes.js'
import { MAX_SOURCE_PHOTO_BYTES } from './projects/limits.js'
import { registerProjectRoutes } from './projects/routes.js'

export type CreateAppOptions = {
  logger?: boolean
}

const RAW_TYPES = ['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function createApp(options: CreateAppOptions = {}) {
  const config = loadConfig()
  if (config.devLoginEnabled) {
    console.warn('DEV LOGIN IS ENABLED. Refuse to deploy this configuration.')
  }

  const app = Fastify({
    logger: options.logger
      ? {
          level: config.logLevel,
          redact: ['req.headers.cookie', 'req.headers.authorization'],
        }
      : false,
    trustProxy: config.trustProxy,
    bodyLimit: Math.max(MAX_REFERENCE_IMAGE_BYTES, MAX_SOURCE_PHOTO_BYTES),
  })

  app.setErrorHandler((error: unknown, request, reply) => {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed')
      return reply.code(500).send({ error: 'Something went wrong' })
    }
    request.log.warn({ err: error }, 'request rejected')
    const message = status === 413 ? 'File too large' : error instanceof Error && error.message ? error.message : 'Bad request'
    return reply.code(status).send({ error: message })
  })

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return
    const origin = request.headers.origin
    if (!origin || origin === config.publicOrigin) return
    return reply.code(403).send({ error: 'Forbidden', code: 'bad_origin' })
  })

  await app.register(helmet, {
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com', 'https://accounts.google.com/gsi/'],
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://accounts.google.com/gsi/'],
        connectSrc: ["'self'", 'https://accounts.google.com', 'https://accounts.google.com/gsi/'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com', 'https://accounts.google.com/gsi/'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
  })
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })
  await app.register(cookie)
  await app.register(cors, { origin: config.publicOrigin, credentials: true })
  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: {
      fileSize: Math.max(MAX_REFERENCE_IMAGE_BYTES, MAX_SOURCE_PHOTO_BYTES),
      files: 1,
    },
  })

  for (const type of RAW_TYPES) {
    app.addContentTypeParser(type, { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body)
    })
  }

  app.get('/api/health', async () => ({ ok: true }))
  app.get('/api/ready', async (_request, reply) => {
    try {
      await getPool().query('select 1')
      await assertStorageReady(config.r2)
    } catch {
      return reply.code(503).send({ error: 'Not ready' })
    }
    return { ok: true }
  })

  await registerAuthRoutes(app)
  await registerPaintRoutes(app)
  await registerFileRoutes(app)
  await registerProjectRoutes(app)
  await registerAccountRoutes(app)

  if (config.staticDir) {
    const staticDir = config.staticDir
    await app.register(fastifyStatic, {
      root: staticDir,
      setHeaders(response, filePath) {
        const base = path.basename(filePath)
        const cache =
          base === 'index.html' || base === 'sw.js' || base.startsWith('manifest')
            ? 'no-cache'
            : filePath.includes(`${path.sep}assets${path.sep}`)
              ? 'public, max-age=31536000, immutable'
              : null
        if (!cache) return
        response.header('Cache-Control', cache)
      },
    })
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.split('?')[0]?.startsWith('/api')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      reply.header('Cache-Control', 'no-cache')
      return reply.sendFile('index.html')
    })
  }

  return app
}
