import 'dotenv/config'
import cors from '@fastify/cors'
import Fastify from 'fastify'

const port = Number(process.env.PORT ?? 3001)
const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

const app = Fastify({ logger: true })

await app.register(cors, {
  origin,
  credentials: true,
})

app.get('/api/health', async () => ({ ok: true }))

await app.listen({ port, host: '0.0.0.0' })
