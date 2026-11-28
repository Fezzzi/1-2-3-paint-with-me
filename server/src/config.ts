import path from 'node:path'

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  sessionSecret: string
  googleClientId: string
  publicOrigin: string
  cookieSecure: boolean
  uploadsDir: string
  staticDir: string | null
  devLoginEnabled: boolean
  trustProxy: boolean
  logLevel: string
  r2: R2Config | null
}

const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const

export function r2Config(env: NodeJS.ProcessEnv): R2Config | null {
  const values = R2_KEYS.map((key) => env[key]?.trim() ?? '')
  const present = values.filter((value) => value.length > 0).length
  if (present === 0) return null
  if (present !== R2_KEYS.length) {
    throw new Error(`Set all of ${R2_KEYS.join(', ')}, or none of them`)
  }
  return {
    accountId: values[0] ?? '',
    accessKeyId: values[1] ?? '',
    secretAccessKey: values[2] ?? '',
    bucket: values[3] ?? '',
  }
}

function nodeEnv(value: string | undefined): AppConfig['nodeEnv'] {
  if (value === 'production' || value === 'test' || value === 'development') return value
  if (value === undefined || value === '') return 'development'
  throw new Error(`NODE_ENV must be development, test, or production`)
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim()
  if (!value) throw new Error(`${key} is not set`)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mode = nodeEnv(env.NODE_ENV)
  const databaseUrl = required(env, 'DATABASE_URL')
  const sessionSecret = required(env, 'SESSION_SECRET')
  if (mode === 'production' && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production')
  }

  const devLoginEnabled = env.DEV_LOGIN_ENABLED === 'true'
  if (mode === 'production' && devLoginEnabled) {
    throw new Error('DEV_LOGIN_ENABLED must not be set in production')
  }

  const cookieSecure = env.COOKIE_SECURE === 'true'
  if (mode === 'production' && !cookieSecure) {
    throw new Error('COOKIE_SECURE must be true in production')
  }

  const port = Number(env.PORT ?? 3001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535')
  }

  const publicOrigin = (env.PUBLIC_ORIGIN ?? env.CLIENT_ORIGIN ?? 'http://localhost:5173').trim()
  if (!publicOrigin) throw new Error('PUBLIC_ORIGIN is not set')

  const uploadsDir = path.resolve(env.UPLOADS_DIR?.trim() || path.join(process.cwd(), 'uploads'))
  const staticDir = env.STATIC_DIR?.trim() ? path.resolve(env.STATIC_DIR.trim()) : null
  const r2 = r2Config(env)

  return {
    nodeEnv: mode,
    port,
    databaseUrl,
    sessionSecret,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() ?? '',
    publicOrigin,
    cookieSecure,
    uploadsDir,
    staticDir,
    devLoginEnabled,
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
    logLevel: env.LOG_LEVEL?.trim() || 'info',
    r2,
  }
}
