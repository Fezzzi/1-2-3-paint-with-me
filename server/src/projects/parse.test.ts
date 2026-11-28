import { describe, expect, it } from 'vitest'
import { parseProjectPayload } from './parse.js'

const paintId = '11111111-1111-4111-8111-111111111111'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    colorCount: 12,
    paperPreset: 'A4',
    paperWidthMm: 210,
    paperHeightMm: 297,
    orientation: 'portrait',
    marginMm: 10,
    coverageRate: 0.02,
    cropX: 0.1,
    cropY: 0.2,
    cropWidth: 0.5,
    cropHeight: 0.6,
    constrainToOwned: false,
    colors: [
      {
        number: 1,
        hex: '#aabbcc',
        paintId,
        areaCm2: 1.5,
        estimatedQuantity: 0.03,
        shortfall: true,
      },
    ],
    ...overrides,
  }
}

describe('parseProjectPayload', () => {
  it('defaults a missing title and keeps numeric color fields as strings', () => {
    const parsed = parseProjectPayload(payload())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.title).toBe('Untitled')
    expect(parsed.value.paperWidthMm).toBe('210')
    expect(parsed.value.coverageRate).toBe('0.02')
    expect(parsed.value.cropX).toBe('0.1')
    expect(parsed.value.cropWidth).toBe('0.5')
    expect(parsed.value.colors[0]).toMatchObject({
      number: 1,
      hex: '#aabbcc',
      paintId,
      areaCm2: '1.5',
      estimatedQuantity: '0.03',
      shortfall: true,
    })
  })

  it('rejects a color count outside 6 to 48', () => {
    expect(parseProjectPayload(payload({ colorCount: 5 })).ok).toBe(false)
    expect(parseProjectPayload(payload({ colorCount: 49 })).ok).toBe(false)
    expect(parseProjectPayload(payload({ colorCount: 6 })).ok).toBe(true)
    expect(parseProjectPayload(payload({ colorCount: 48 })).ok).toBe(true)
  })

  it('rejects a crop that leaves the photo', () => {
    expect(parseProjectPayload(payload({ cropX: 0.8, cropWidth: 0.4 })).ok).toBe(false)
    expect(parseProjectPayload(payload({ cropWidth: 0 })).ok).toBe(false)
  })
})
