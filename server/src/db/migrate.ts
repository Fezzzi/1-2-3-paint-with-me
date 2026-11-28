import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { getDb } from './client.js'

export async function runMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const migrationsFolder = path.resolve(here, '../../drizzle')
  await migrate(getDb(), { migrationsFolder })
}
