/**
 * Paper sizes are stored in millimetres.
 * Preset dimensions are portrait: width <= height.
 * Landscape swaps those sides.
 *
 * A custom size may be passed with width and height in either order.
 * Portrait assigns the shorter side to the width.
 * Landscape assigns the longer side to the width, so the caller does not
 * need to pre-swap a custom size.
 */

export type PaperPreset = 'A5' | 'A4' | 'A3' | 'Letter'

export type PaperOrientation = 'portrait' | 'landscape'

export type PaperSize = {
  widthMm: number
  heightMm: number
}

export const PAPER_PRESETS_MM: Record<PaperPreset, PaperSize> = {
  A5: { widthMm: 148, heightMm: 210 },
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
}

export type CustomPaper = {
  widthMm: number
  heightMm: number
}

function orient(widthMm: number, heightMm: number, orientation: PaperOrientation): PaperSize {
  const longer = Math.max(widthMm, heightMm)
  const shorter = Math.min(widthMm, heightMm)
  if (orientation === 'landscape') return { widthMm: longer, heightMm: shorter }
  return { widthMm: shorter, heightMm: longer }
}

export function paperSizeMm(size: PaperPreset | CustomPaper, orientation: PaperOrientation): PaperSize {
  if (typeof size === 'string') {
    const preset = PAPER_PRESETS_MM[size]
    return orient(preset.widthMm, preset.heightMm, orientation)
  }

  if (!Number.isFinite(size.widthMm) || !Number.isFinite(size.heightMm) || size.widthMm <= 0 || size.heightMm <= 0) {
    throw new Error('Custom paper width and height must be positive numbers of millimetres')
  }

  return orient(size.widthMm, size.heightMm, orientation)
}
