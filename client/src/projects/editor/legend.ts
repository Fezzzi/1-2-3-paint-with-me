import type { PaintJson } from '../../paints/api.ts'
import { paintTitle } from '../../paints/draft.ts'
import { assignDistinctPaints, suggestPaintIds, usablePaintCount } from '../../processing/engine/palette.ts'
import type { ReducePayload } from '../../processing/engine/protocol.ts'
import { estimateQuantity } from '../../processing/quantity.ts'

export type LegendRow = {
  number: number
  hex: string
  paintId: string | null
  paintName: string | null
  areaCm2: number
  estimatedMl: number
  shortfall: boolean
}

export function buildLegend(
  result: ReducePayload,
  paints: readonly PaintJson[],
  constrainToOwned: boolean,
  paper: { widthMm: number; heightMm: number; marginMm: number; coverageMlPerCm2: number },
): LegendRow[] {
  const hexes = result.palette.map((color) => color.hex)
  const distinct = constrainToOwned && usablePaintCount(paints) >= hexes.length && hexes.length > 0
  const assigned = distinct ? assignDistinctPaints(hexes, paints).map((paint) => paint.id) : suggestPaintIds(hexes, paints)
  const byId = new Map(paints.map((paint) => [paint.id, paint]))
  return result.palette.map((color, index) => {
    const paint = assigned[index] ? byId.get(assigned[index] ?? '') : undefined
    const quantity = estimateQuantity({
      pixelCount: color.pixelCount,
      imageWidth: result.width,
      imageHeight: result.height,
      paperWidthMm: paper.widthMm,
      paperHeightMm: paper.heightMm,
      marginMm: paper.marginMm,
      coverageMlPerCm2: paper.coverageMlPerCm2,
      quantityOnHand: paint?.quantityOnHand ?? null,
      unit: paint?.unit ?? null,
    })
    return {
      number: index + 1,
      hex: color.hex,
      paintId: paint?.id ?? null,
      paintName: paint ? paintTitle(paint) : null,
      areaCm2: quantity.areaCm2,
      estimatedMl: quantity.estimatedMl,
      shortfall: quantity.shortfall,
    }
  })
}
