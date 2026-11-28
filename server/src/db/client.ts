import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

const { Pool } = pg

let pool: pg.Pool | undefined

export function databasePoolConfig(connectionString: string): pg.PoolConfig {
  const cleaned = stripChannelBinding(connectionString)
  const sslMode = /[?&]sslmode=([^&]+)/.exec(cleaned)?.[1]
  const encrypted = cleaned.includes('.neon.tech') || sslMode === 'require' || sslMode === 'verify-full' || sslMode === 'verify-ca'
  return {
    connectionString: cleaned,
    max: 5,
    ssl: encrypted ? { rejectUnauthorized: sslMode === 'verify-full' || sslMode === 'verify-ca' } : undefined,
  }
}

function stripChannelBinding(connectionString: string): string {
  const query = connectionString.indexOf('?')
  if (query === -1) return connectionString
  const params = connectionString
    .slice(query + 1)
    .split('&')
    .filter((part) => part.length > 0 && !part.startsWith('channel_binding='))
  return params.length > 0 ? `${connectionString.slice(0, query)}?${params.join('&')}` : connectionString.slice(0, query)
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }

  pool ??= new Pool(databasePoolConfig(connectionString))
  return drizzle(pool, { schema })
}

export function getPool(): pg.Pool {
  getDb()
  if (!pool) throw new Error('Database pool is not open')
  return pool
}

export async function closeDb(): Promise<void> {
  const current = pool
  pool = undefined
  if (current) await current.end()
}
