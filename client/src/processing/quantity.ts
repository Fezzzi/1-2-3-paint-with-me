export type QuantityInput = {
  pixelCount: number
  imageWidth: number
  imageHeight: number
  paperWidthMm: number
  paperHeightMm: number
  marginMm: number
  coverageMlPerCm2: number
  quantityOnHand: number | null
  unit: string | null
}

export type QuantityEstimate = {
  areaCm2: number
  estimatedMl: number
  shortfall: boolean
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/**
 * Printable size is the paper minus the margin on both sides of each axis,
 * and never smaller than 1 mm. `estimatedMl` and `areaCm2` are rounded to
 * 2 decimals. `shortfall` uses the unrounded millilitres, and only when the
 * unit is exactly "ml" (any letter case) and the amount on hand is a finite number.
 */
export function estimateQuantity(input: QuantityInput): QuantityEstimate {
  const imagePixels = input.imageWidth * input.imageHeight
  const fraction = imagePixels > 0 ? input.pixelCount / imagePixels : 0
  const printableWidthMm = Math.max(1, input.paperWidthMm - 2 * input.marginMm)
  const printableHeightMm = Math.max(1, input.paperHeightMm - 2 * input.marginMm)
  const areaRaw = fraction * (printableWidthMm / 10) * (printableHeightMm / 10)
  const estimatedRaw = areaRaw * input.coverageMlPerCm2
  const unitIsMl = typeof input.unit === 'string' && input.unit.toLowerCase() === 'ml'
  const onHand = input.quantityOnHand
  const shortfall = unitIsMl && typeof onHand === 'number' && Number.isFinite(onHand) && onHand < estimatedRaw

  return {
    areaCm2: round2(areaRaw),
    estimatedMl: round2(estimatedRaw),
    shortfall,
  }
}
