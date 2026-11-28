import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveStoredPath } from './store.js'

describe('resolveStoredPath', () => {
  it('accepts a normal relative storage path', () => {
    const storagePath = '11111111-1111-4111-8111-111111111111/photo.jpg'
    const resolved = resolveStoredPath(storagePath)

    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    expect(resolved).toBe(
      path.resolve(uploadsRoot, '11111111-1111-4111-8111-111111111111', 'photo.jpg'),
    )
    expect(resolved.startsWith(uploadsRoot + path.sep)).toBe(true)
  })

  it('rejects parent directory segments', () => {
    expect(() => resolveStoredPath('..')).toThrow(/Invalid storage path/)
    expect(() => resolveStoredPath('../secret.txt')).toThrow(/Invalid storage path/)
    expect(() => resolveStoredPath('user/../../secret.txt')).toThrow(/Invalid storage path/)
    expect(() => resolveStoredPath('user\\..\\secret.txt')).toThrow(/Invalid storage path/)
  })

  it('rejects absolute paths', () => {
    expect(() => resolveStoredPath(path.resolve('uploads', 'user', 'photo.jpg'))).toThrow(
      /Invalid storage path/,
    )
    expect(() => resolveStoredPath('/etc/passwd')).toThrow(/Invalid storage path/)
    expect(() => resolveStoredPath('\\\\server\\share\\file.jpg')).toThrow(/Invalid storage path/)
  })
})
