import type { CropNorm } from '../processing/crop.ts'
import { WORKING_MAX_EDGE } from '../processing/defaults.ts'

export type RasterImage = {
  rgba: Uint8ClampedArray
  width: number
  height: number
}

export async function measureImage(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await openBitmap(file)
  try {
    if (bitmap.width === 0 || bitmap.height === 0) throw new Error("This photo couldn't be opened. Try a JPEG or PNG.")
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

async function openBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    // createImageBitmap uses the first frame of an animated GIF.
    return await createImageBitmap(file)
  } catch {
    throw new Error("This photo couldn't be opened. Try a JPEG or PNG.")
  }
}

export async function readCroppedRgba(
  file: Blob,
  crop: CropNorm,
  maxEdge = WORKING_MAX_EDGE,
): Promise<RasterImage> {
  const bitmap = await openBitmap(file)
  try {
    if (bitmap.width === 0 || bitmap.height === 0) throw new Error("This photo couldn't be opened. Try a JPEG or PNG.")
    const sx = clampInt(Math.floor(crop.x * bitmap.width), 0, bitmap.width - 1)
    const sy = clampInt(Math.floor(crop.y * bitmap.height), 0, bitmap.height - 1)
    const sw = clampInt(Math.round(crop.width * bitmap.width), 1, bitmap.width - sx)
    const sh = clampInt(Math.round(crop.height * bitmap.height), 1, bitmap.height - sy)
    const longest = Math.max(sw, sh)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    const dw = Math.max(1, Math.round(sw * scale))
    const dh = Math.max(1, Math.round(sh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = dw
    canvas.height = dh
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error("This photo couldn't be opened. Try a JPEG or PNG.")
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
    const pixels = context.getImageData(0, 0, dw, dh)
    return { rgba: new Uint8ClampedArray(pixels.data), width: dw, height: dh }
  } finally {
    bitmap.close()
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}
