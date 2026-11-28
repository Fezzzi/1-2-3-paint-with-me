import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../../processing/defaults.ts'
import { analysisKey } from './analysisKey.ts'

describe('analysisKey', () => {
  it('rounds the crop to 1e-4 and includes the engine version', () => {
    expect(analysisKey('file', { x: 0.123456, y: 0.2, width: 0.5, height: 0.8 })).toBe(
      `file:0.1235,0.2000,0.5000,0.8000:${ENGINE_VERSION}`,
    )
  })
})
