import { describe, expect, it } from 'vitest'
import { storageLimits, storageWouldExceed, DEFAULT_R2_ACCOUNT_BYTES, DEFAULT_R2_USER_BYTES } from './quota.js'

describe('storageLimits', () => {
  it('stays open on local disk unless a cap is set', () => {
    expect(storageLimits({}, false)).toEqual({ accountBytes: null, userBytes: null })
  })

  it('stops R2 under the free allowance', () => {
    expect(storageLimits({}, true)).toEqual({
      accountBytes: DEFAULT_R2_ACCOUNT_BYTES,
      userBytes: DEFAULT_R2_USER_BYTES,
    })
  })

  it('treats unlimited and zero as no cap', () => {
    expect(storageLimits({ STORAGE_MAX_BYTES: 'unlimited', USER_STORAGE_MAX_BYTES: '0' }, true)).toEqual({
      accountBytes: null,
      userBytes: null,
    })
  })
})

describe('storageWouldExceed', () => {
  it('counts bytes the upload will replace', () => {
    expect(storageWouldExceed(100, 40, 30, 100)).toBe(true)
    expect(storageWouldExceed(100, 30, 30, 100)).toBe(false)
    expect(storageWouldExceed(100, 1, 0, null)).toBe(false)
  })
})
