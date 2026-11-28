import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://paint:paint@127.0.0.1:5433/paint_with_me',
  SESSION_SECRET: 'x'.repeat(32),
  COOKIE_SECURE: 'true',
  PUBLIC_ORIGIN: 'https://example.com',
  DEV_LOGIN_ENABLED: 'false',
}

describe('loadConfig', () => {
  it('rejects dev login in production', () => {
    expect(() => loadConfig({ ...base, DEV_LOGIN_ENABLED: 'true' })).toThrow(/DEV_LOGIN_ENABLED/)
  })

  it('rejects an insecure cookie in production', () => {
    expect(() => loadConfig({ ...base, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => loadConfig({ ...base, COOKIE_SECURE: undefined })).toThrow(/COOKIE_SECURE/)
  })

  it('requires a complete R2 configuration', () => {
    expect(loadConfig(base).r2).toBeNull()
    expect(() => loadConfig({ ...base, R2_BUCKET: 'paint-with-me' })).toThrow(/R2_ACCOUNT_ID/)
    expect(
      loadConfig({
        ...base,
        R2_ACCOUNT_ID: 'account',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'paint-with-me',
      }).r2,
    ).toEqual({
      accountId: 'account',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'paint-with-me',
    })
  })
})
