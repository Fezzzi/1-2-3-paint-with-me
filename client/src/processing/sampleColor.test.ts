import { describe, expect, it } from 'vitest'
import { averageHex, dominantHex } from './sampleColor.ts'

function makeImage(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    data[offset] = rgba[0]
    data[offset + 1] = rgba[1]
    data[offset + 2] = rgba[2]
    data[offset + 3] = rgba[3]
  }
  return data
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  rgba: [number, number, number, number],
): void {
  const offset = (y * width + x) * 4
  data[offset] = rgba[0]
  data[offset + 1] = rgba[1]
  data[offset + 2] = rgba[2]
  data[offset + 3] = rgba[3]
}

describe('averageHex', () => {
  it('averages a known neighborhood and skips pixels outside that radius', () => {
    const width = 5
    const height = 5
    const data = makeImage(width, height, [255, 255, 255, 255])
    const values = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
      [100, 0, 0],
      [16, 17, 18],
      [19, 20, 21],
      [22, 23, 24],
      [25, 26, 27],
    ]
    let index = 0
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        const value = values[index]
        if (!value) throw new Error('missing fixture pixel')
        setPixel(data, width, x, y, [value[0], value[1], value[2], 255])
        index += 1
      }
    }

    // Radius 0 is only the center pixel. Radius 1 averages the 3×3 (means 22.67, 12.44, 13.33)
    // and leaves the white pixels outside that square out of the average.
    expect(averageHex(data, width, height, 2, 2, 0)).toBe('#640000')
    expect(averageHex(data, width, height, 2, 2, 1)).toBe('#170c0d')
  })

  it('ignores out-of-bounds neighbors instead of treating them as black', () => {
    const data = makeImage(3, 3, [1, 2, 3, 255])
    setPixel(data, 3, 1, 1, [255, 255, 255, 255])

    // Radius 4 covers the whole 3×3 plus 72 outside pixels. The in-bounds mean is
    // about 29.2, 30.1, 31. A single center pixel would be #ffffff, and counting
    // the outside as black would fall near #030303.
    expect(averageHex(data, 3, 3, 1, 1, 4)).toBe('#1d1e1f')

    const corner = makeImage(2, 2, [0, 0, 0, 255])
    setPixel(corner, 2, 0, 0, [100, 0, 0, 255])
    // Four in-bounds pixels, one of them red 100. Five outside pixels are skipped.
    expect(averageHex(corner, 2, 2, 0, 0, 1)).toBe('#190000')
    expect(averageHex(makeImage(1, 1, [255, 128, 64, 255]), 1, 1, 0, 0, 4)).toBe('#ff8040')
  })

  it('ignores transparent pixels in the neighborhood', () => {
    const data = makeImage(3, 1, [0, 0, 0, 0])
    setPixel(data, 3, 1, 0, [10, 20, 30, 255])
    expect(averageHex(data, 3, 1, 1, 0, 1)).toBe('#0a141e')
  })
})

describe('dominantHex', () => {
  it('picks a colored region instead of a white background', () => {
    const width = 20
    const height = 20
    const data = makeImage(width, height, [250, 250, 250, 255])
    for (let y = 4; y < 7; y += 1) {
      for (let x = 4; x < 7; x += 1) {
        setPixel(data, width, x, y, [200, 0, 0, 255])
      }
    }

    expect(dominantHex(data, width, height)).toBe('#cc0000')
  })

  it('ignores near-transparent pixels when another opaque color exists', () => {
    const data = makeImage(4, 1, [255, 0, 0, 0])
    setPixel(data, 4, 3, 0, [0, 0, 200, 255])
    expect(dominantHex(data, 4, 1)).toBe('#0000cc')
  })

  it('falls back to the near-white bucket when the photo has no other color', () => {
    expect(dominantHex(makeImage(2, 2, [255, 255, 255, 255]), 2, 2)).toBe('#ffffff')
  })

  it('throws when the image has no sampleable pixels', () => {
    expect(() => dominantHex(new Uint8ClampedArray(), 0, 0)).toThrow(/no sampleable pixels/i)
    expect(() => dominantHex(makeImage(2, 2, [10, 20, 30, 0]), 2, 2)).toThrow(/no sampleable pixels/i)
    expect(() => averageHex(makeImage(1, 1, [0, 0, 0, 255]), 1, 1, 20, 20, 0)).toThrow(
      /no sampleable pixels/i,
    )
  })
})
