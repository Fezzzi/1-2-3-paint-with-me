import 'dotenv/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { closeDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'

const config = loadConfig()
if (config.nodeEnv === 'production') await runMigrations()

const app = await createApp({ logger: true })
await app.listen({ port: config.port, host: '0.0.0.0' })

let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  await app.close()
  await closeDb()
}

process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0))
})
process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0))
})
