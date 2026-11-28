import { describe, expect, it } from 'vitest'
import { nearestPaint } from './match.ts'

describe('nearestPaint', () => {
  it('picks the closer hex', () => {
    const red = { id: 'red', hex: '#ff0000' }
    const blue = { id: 'blue', hex: '#0000ff' }
    expect(nearestPaint('#ff0000', [blue, red])?.id).toBe('red')
    expect(nearestPaint('#cc0000', [blue, red])?.id).toBe('red')
  })

  it('returns null when no paint has a hex', () => {
    expect(nearestPaint('#ff0000', [])).toBeNull()
    expect(nearestPaint('#ff0000', [{ id: 'blank', hex: null }, { id: 'bad', hex: 'not-a-color' }])).toBeNull()
  })
})
