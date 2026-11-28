import { describe, expect, it } from 'vitest'
import {
  cropToPlacement,
  defaultPlacement,
  maxFitSize,
  moveCrop,
  orientationForImage,
  placementToCrop,
  zoomPlacement,
} from './crop.ts'

const portrait = 210 / 297

describe('orientationForImage', () => {
  it('uses landscape for a wide photo and portrait otherwise', () => {
    expect(orientationForImage(400, 200)).toBe('landscape')
    expect(orientationForImage(200, 400)).toBe('portrait')
    expect(orientationForImage(300, 300)).toBe('portrait')
  })
})

describe('placementToCrop', () => {
  it('fits a portrait page inside a square photo', () => {
    const crop = placementToCrop(1000, 1000, portrait, defaultPlacement)
    expect(crop.y).toBe(0)
    expect(crop.height).toBe(1)
    expect(crop.width).toBeCloseTo(portrait, 3)
    expect(crop.x).toBeCloseTo((1 - crop.width) / 2, 3)
  })

  it('shrinks around the center when zoomed in', () => {
    const crop = placementToCrop(1000, 1000, portrait, { zoom: 2, centerX: 0.5, centerY: 0.5 })
    const fitted = placementToCrop(1000, 1000, portrait, defaultPlacement)
    expect(crop.width).toBeCloseTo(fitted.width / 2, 3)
    expect(crop.height).toBeCloseTo(fitted.height / 2, 3)
    expect(crop.x + crop.width / 2).toBeCloseTo(0.5, 3)
    expect(crop.y + crop.height / 2).toBeCloseTo(0.5, 3)
  })

  it('keeps the page inside the photo', () => {
    const moved = moveCrop(800, 600, 297 / 210, { zoom: 3, centerX: 0.5, centerY: 0.5 }, -1, -1)
    const crop = placementToCrop(800, 600, 297 / 210, moved)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(1.0001)
    expect(crop.y + crop.height).toBeLessThanOrEqual(1.0001)
  })

  it('round-trips a saved crop back to about the same zoom and center', () => {
    const placed = { zoom: 2.5, centerX: 0.42, centerY: 0.63 }
    const crop = placementToCrop(4000, 3000, portrait, placed)
    const back = cropToPlacement(4000, 3000, portrait, crop)
    expect(back.zoom).toBeCloseTo(placed.zoom, 1)
    expect(back.centerX).toBeCloseTo(placed.centerX, 2)
    expect(back.centerY).toBeCloseTo(placed.centerY, 2)
  })

  it('zooms toward an anchor without leaving the photo', () => {
    const next = zoomPlacement(1000, 800, portrait, defaultPlacement, 3, 0.2, 0.3)
    const crop = placementToCrop(1000, 800, portrait, next)
    expect(crop.width).toBeLessThan(maxFitSize(1000, 800, portrait).width)
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(1.0001)
  })
})
