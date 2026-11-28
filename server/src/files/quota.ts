export const DEFAULT_R2_ACCOUNT_BYTES = 8 * 1024 * 1024 * 1024
export const DEFAULT_R2_USER_BYTES = 200 * 1024 * 1024

export type StorageLimits = {
  accountBytes: number | null
  userBytes: number | null
}

export class StorageLimitError extends Error {
  readonly statusCode = 507

  constructor(message: string) {
    super(message)
    this.name = 'StorageLimitError'
  }
}

export function storageLimits(env: NodeJS.ProcessEnv, r2Enabled: boolean): StorageLimits {
  return {
    accountBytes: byteLimit(env.STORAGE_MAX_BYTES, r2Enabled ? DEFAULT_R2_ACCOUNT_BYTES : null, 'STORAGE_MAX_BYTES'),
    userBytes: byteLimit(env.USER_STORAGE_MAX_BYTES, r2Enabled ? DEFAULT_R2_USER_BYTES : null, 'USER_STORAGE_MAX_BYTES'),
  }
}

export function storageWouldExceed(used: number, incoming: number, replacing: number, cap: number | null): boolean {
  if (cap === null) return false
  return used + incoming - Math.max(0, replacing) > cap
}

function byteLimit(value: string | undefined, fallback: number | null, name: string): number | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return fallback
  if (trimmed === 'unlimited') return null
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be a byte count or unlimited`)
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a byte count or unlimited`)
  return parsed === 0 ? null : parsed
}
