import type { PaperOrientation } from './paper.ts'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 8

export type CropNorm = {
  x: number
  y: number
  width: number
  height: number
}

export type CropPlacement = {
  zoom: number
  centerX: number
  centerY: number
}

export const defaultPlacement: CropPlacement = {
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
}

export function orientationForImage(width: number, height: number): PaperOrientation {
  return width > height ? 'landscape' : 'portrait'
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM)
}

/**
 * Largest page-shaped rectangle that fits inside the image.
 * Width and height are fractions of the image.
 * `pageAspect` is page width divided by page height.
 */
export function maxFitSize(
  imageWidth: number,
  imageHeight: number,
  pageAspect: number,
): { width: number; height: number } {
  if (imageWidth <= 0 || imageHeight <= 0 || !Number.isFinite(pageAspect) || pageAspect <= 0) {
    return { width: 1, height: 1 }
  }
  const imageAspect = imageWidth / imageHeight
  if (pageAspect >= imageAspect) return { width: 1, height: round4(imageAspect / pageAspect) }
  return { width: round4(pageAspect / imageAspect), height: 1 }
}

export function placementToCrop(
  imageWidth: number,
  imageHeight: number,
  pageAspect: number,
  placement: CropPlacement,
): CropNorm {
  const fit = maxFitSize(imageWidth, imageHeight, pageAspect)
  const zoom = clampZoom(placement.zoom)
  let width = round4(fit.width / zoom)
  let height = round4(fit.height / zoom)
  if (width <= 0) width = fit.width
  if (height <= 0) height = fit.height
  if (width > 1) width = 1
  if (height > 1) height = 1
  const centerX = Number.isFinite(placement.centerX) ? placement.centerX : 0.5
  const centerY = Number.isFinite(placement.centerY) ? placement.centerY : 0.5
  let x = round4(clamp(centerX - width / 2, 0, 1 - width))
  let y = round4(clamp(centerY - height / 2, 0, 1 - height))
  if (x + width > 1) x = round4(Math.max(0, 1 - width))
  if (y + height > 1) y = round4(Math.max(0, 1 - height))
  return { x, y, width, height }
}

export function cropToPlacement(
  imageWidth: number,
  imageHeight: number,
  pageAspect: number,
  crop: CropNorm,
): CropPlacement {
  const fit = maxFitSize(imageWidth, imageHeight, pageAspect)
  const zoom = crop.width > 0 ? clampZoom(fit.width / crop.width) : MIN_ZOOM
  return {
    zoom,
    centerX: clamp(crop.x + crop.width / 2, 0, 1),
    centerY: clamp(crop.y + crop.height / 2, 0, 1),
  }
}

export function moveCrop(
  imageWidth: number,
  imageHeight: number,
  pageAspect: number,
  placement: CropPlacement,
  x: number,
  y: number,
): CropPlacement {
  const current = placementToCrop(imageWidth, imageHeight, pageAspect, placement)
  const nextX = clamp(x, 0, 1 - current.width)
  const nextY = clamp(y, 0, 1 - current.height)
  return {
    zoom: clampZoom(placement.zoom),
    centerX: nextX + current.width / 2,
    centerY: nextY + current.height / 2,
  }
}

/** Zoom around a point given in image fractions, keeping that point under the same part of the page. */
export function zoomPlacement(
  imageWidth: number,
  imageHeight: number,
  pageAspect: number,
  placement: CropPlacement,
  zoom: number,
  anchorX: number,
  anchorY: number,
): CropPlacement {
  const current = placementToCrop(imageWidth, imageHeight, pageAspect, placement)
  const nextZoom = clampZoom(zoom)
  const fit = maxFitSize(imageWidth, imageHeight, pageAspect)
  let width = round4(fit.width / nextZoom)
  let height = round4(fit.height / nextZoom)
  if (width <= 0 || height <= 0 || width > 1 || height > 1) {
    width = current.width
    height = current.height
  }
  const relX = current.width > 0 ? (anchorX - current.x) / current.width : 0.5
  const relY = current.height > 0 ? (anchorY - current.y) / current.height : 0.5
  const x = clamp(anchorX - relX * width, 0, 1 - width)
  const y = clamp(anchorY - relY * height, 0, 1 - height)
  return {
    zoom: nextZoom,
    centerX: x + width / 2,
    centerY: y + height / 2,
  }
}

export function cropFromFractions(
  x: number | null,
  y: number | null,
  width: number | null,
  height: number | null,
): CropNorm | null {
  if (x === null || y === null || width === null || height === null) return null
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null
  if (x < -0.001 || y < -0.001 || width <= 0 || height <= 0) return null
  if (x > 1 || y > 1 || width > 1 || height > 1) return null
  if (x + width > 1.001 || y + height > 1.001) return null
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width,
    height,
  }
}
