import { describe, expect, it } from 'vitest'
import { databasePoolConfig } from './client.js'

describe('databasePoolConfig', () => {
  it('drops channel_binding and encrypts a Neon URL without verifying sslmode=require', () => {
    const config = databasePoolConfig(
      'postgresql://paint:secret@ep-example.eu-central-1.aws.neon.tech/paint_with_me?sslmode=require&channel_binding=require',
    )
    expect(config.connectionString).toBe(
      'postgresql://paint:secret@ep-example.eu-central-1.aws.neon.tech/paint_with_me?sslmode=require',
    )
    expect(config.ssl).toEqual({ rejectUnauthorized: false })
    expect(config.max).toBe(5)
  })

  it('verifies the certificate when sslmode asks for it', () => {
    const config = databasePoolConfig('postgres://paint:paint@db:5432/paint_with_me?sslmode=verify-full')
    expect(config.ssl).toEqual({ rejectUnauthorized: true })
  })

  it('leaves a local URL unencrypted', () => {
    const config = databasePoolConfig('postgres://paint:paint@127.0.0.1:5433/paint_with_me')
    expect(config.ssl).toBeUndefined()
    expect(config.connectionString).toBe('postgres://paint:paint@127.0.0.1:5433/paint_with_me')
  })
})
