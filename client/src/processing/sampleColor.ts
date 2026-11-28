/**
 * Reference-photo color sampling.
 *
 * `averageHex` averages raw RGB in a square neighborhood and skips pixels
 * outside the image. `dominantHex` quantizes each channel to 16 levels
 * (`round(channel / 17)`, clamped to 0–15) and returns that bucket as
 * lowercase `#rrggbb`, using `level * 17` so 0 and 255 stay exact.
 *
 * Near-transparent pixels (alpha < 128) are ignored. Near-white pixels
 * (r, g, and b all >= 240) are ignored when any other opaque color exists.
 * If every opaque pixel is near-white, the most common near-white bucket is
 * returned. If the image has no sampleable pixels, both functions throw
 * `Error('Image has no sampleable pixels')`. Tied buckets keep the one
 * encountered first in row-major order.
 */

const NEAR_WHITE = 240
const MIN_OPAQUE_ALPHA = 128

function assertSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Image has no sampleable pixels')
  }
}

function channelByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function toHex(red: number, green: number, blue: number): string {
  const part = (value: number) => channelByte(value).toString(16).padStart(2, '0')
  return `#${part(red)}${part(green)}${part(blue)}`
}

function bucketLevel(channel: number): number {
  return Math.min(15, Math.max(0, Math.round(channel / 17)))
}

function fromBucketLevel(level: number): number {
  return Math.min(255, level * 17)
}

function bucketColor(red: number, green: number, blue: number): { key: string; color: string } {
  const redLevel = bucketLevel(red)
  const greenLevel = bucketLevel(green)
  const blueLevel = bucketLevel(blue)
  return {
    key: `${redLevel},${greenLevel},${blueLevel}`,
    color: toHex(fromBucketLevel(redLevel), fromBucketLevel(greenLevel), fromBucketLevel(blueLevel)),
  }
}

function isNearWhite(red: number, green: number, blue: number): boolean {
  return red >= NEAR_WHITE && green >= NEAR_WHITE && blue >= NEAR_WHITE
}

function mostCommon(counts: Map<string, { color: string; count: number }>): string | null {
  let best: { color: string; count: number } | null = null
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best?.color ?? null
}

export function averageHex(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): string {
  assertSize(width, height)
  const span = Number.isFinite(radius) ? Math.max(0, Math.floor(radius)) : 0
  const centerX = Math.round(x)
  const centerY = Math.round(y)
  let red = 0
  let green = 0
  let blue = 0
  let count = 0

  for (let py = centerY - span; py <= centerY + span; py += 1) {
    if (py < 0 || py >= height) continue
    for (let px = centerX - span; px <= centerX + span; px += 1) {
      if (px < 0 || px >= width) continue
      const offset = (py * width + px) * 4
      if (offset + 3 >= data.length) continue
      if ((data[offset + 3] ?? 0) < MIN_OPAQUE_ALPHA) continue
      red += data[offset] ?? 0
      green += data[offset + 1] ?? 0
      blue += data[offset + 2] ?? 0
      count += 1
    }
  }

  if (count === 0) throw new Error('Image has no sampleable pixels')
  return toHex(red / count, green / count, blue / count)
}

export function dominantHex(data: Uint8ClampedArray, width: number, height: number): string {
  assertSize(width, height)
  const pixelCount = Math.min(width * height, Math.floor(data.length / 4))
  if (pixelCount === 0) throw new Error('Image has no sampleable pixels')

  const colors = new Map<string, { color: string; count: number }>()
  const whites = new Map<string, { color: string; count: number }>()

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    const red = data[offset] ?? 0
    const green = data[offset + 1] ?? 0
    const blue = data[offset + 2] ?? 0
    const alpha = data[offset + 3] ?? 0
    if (alpha < MIN_OPAQUE_ALPHA) continue

    const bucket = bucketColor(red, green, blue)
    const counts = isNearWhite(red, green, blue) ? whites : colors
    const current = counts.get(bucket.key)
    if (current) current.count += 1
    else counts.set(bucket.key, { color: bucket.color, count: 1 })
  }

  const winner = mostCommon(colors.size > 0 ? colors : whites)
  if (!winner) throw new Error('Image has no sampleable pixels')
  return winner
}
