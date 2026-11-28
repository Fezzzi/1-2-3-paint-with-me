import { LABEL_FLOOR_MM, LABEL_MAX_MM, LABEL_MIN_MM } from './params.ts'
import { chamferMax, connectedComponents } from './regions.ts'
import type { LabelPlacement } from './types.ts'

export function placeLabels(
  labels: Uint8Array,
  width: number,
  height: number,
  pxPerMm: number,
  labelMinMm = LABEL_MIN_MM,
): LabelPlacement[] {
  const { comp, color } = connectedComponents(labels, width, height)
  const { radius, at } = chamferMax(comp, color.length, width, height)
  const scale = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 1
  const minPx = labelMinMm * scale
  const floorPx = LABEL_FLOOR_MM * scale
  const maxPx = LABEL_MAX_MM * scale
  const placed: LabelPlacement[] = []
  for (let id = 0; id < color.length; id += 1) {
    const number = (color[id] ?? 0) + 1
    const digits = String(number).length
    const reach = radius[id] ?? 1
    const fitPx = (2 * reach) / Math.hypot(0.56 * digits, 0.75)
    let fontPx = fitPx > maxPx ? maxPx : fitPx
    if (fontPx < minPx) fontPx = Math.max(floorPx, Math.min(fitPx, minPx))
    const index = at[id] ?? 0
    placed.push({
      number,
      x: (index % width) + 0.5,
      y: Math.floor(index / width) + 0.5,
      fontPx,
      radius: reach,
    })
  }
  return placed
}
