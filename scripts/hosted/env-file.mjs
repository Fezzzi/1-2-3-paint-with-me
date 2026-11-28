import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const hostedEnvPath = path.resolve(process.cwd(), '.env.hosted')

export async function readHostedEnv() {
  let text = ''
  try {
    text = await readFile(hostedEnvPath, 'utf8')
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  return parseEnv(text)
}

export async function writeHostedEnv(values) {
  const current = await readHostedEnv()
  const next = { ...current, ...values }
  const lines = Object.entries(next).map(([key, value]) => `${key}=${value ?? ''}`)
  await writeFile(hostedEnvPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
}

export function required(env, key) {
  const value = env[key]?.trim() ?? ''
  if (!value) throw new Error(`${key} is empty in .env.hosted`)
  return value
}

export function generateSecret() {
  return randomBytes(36).toString('base64url')
}

export function databaseHost(connectionString) {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:/, 'https:')).host
  } catch {
    return 'database'
  }
}

function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function isMissing(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
