import { differenceCiede2000, formatHex, parse } from 'culori'

const deltaE = differenceCiede2000()

export type MatchablePaint = {
  id: string
  hex: string | null
}

export function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null
  const parsed = parse(hex)
  if (!parsed) return null
  const formatted = formatHex(parsed)
  return formatted ? formatted.toLowerCase() : null
}

export function colorDistance(left: string, right: string): number {
  const standard = parse(left)
  const sample = parse(right)
  if (!standard || !sample) return Number.POSITIVE_INFINITY
  const distance = deltaE(standard, sample)
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY
}

export function nearestPaint<T extends MatchablePaint>(hex: string, paints: readonly T[]): T | null {
  const target = parse(hex)
  if (!target) return null

  let best: T | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const paint of paints) {
    const color = paint.hex ? parse(paint.hex) : undefined
    if (!color) continue
    const distance = deltaE(target, color)
    if (!Number.isFinite(distance) || distance >= bestDistance) continue
    best = paint
    bestDistance = distance
  }
  return best
}

/**
 * Maps each palette hex to the nearest owned paint. Two slots may land on the
 * same hex when several quantized colors share one paint.
 */
export function constrainPalette(palette: readonly string[], paints: readonly MatchablePaint[]): string[] {
  return palette.map((hex) => {
    const paint = nearestPaint(hex, paints)
    return normalizeHex(paint?.hex) ?? normalizeHex(hex) ?? hex.toLowerCase()
  })
}
