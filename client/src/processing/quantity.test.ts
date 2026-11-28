import { describe, expect, it } from 'vitest'
import { estimateQuantity } from './quantity.ts'

const paper = {
  pixelCount: 1,
  imageWidth: 2,
  imageHeight: 2,
  paperWidthMm: 100,
  paperHeightMm: 200,
  marginMm: 0,
  coverageMlPerCm2: 1,
}

describe('estimateQuantity', () => {
  it('converts a known pixel fraction and paper size into area and millilitres', () => {
    const estimate = estimateQuantity({ ...paper, quantityOnHand: null, unit: null })
    expect(estimate.areaCm2).toBe(50)
    expect(estimate.estimatedMl).toBe(50)
    expect(estimate.shortfall).toBe(false)
  })

  it('flags a shortfall when the unit is ml and the amount on hand is less', () => {
    expect(estimateQuantity({ ...paper, quantityOnHand: 49.99, unit: 'ml' }).shortfall).toBe(true)
    expect(estimateQuantity({ ...paper, quantityOnHand: 49.99, unit: 'ML' }).shortfall).toBe(true)

    const barelyShort = estimateQuantity({
      pixelCount: 1000,
      imageWidth: 1000,
      imageHeight: 1000,
      paperWidthMm: 100,
      paperHeightMm: 100,
      marginMm: 0,
      coverageMlPerCm2: 10.04,
      quantityOnHand: 1,
      unit: 'ml',
    })
    expect(barelyShort.estimatedMl).toBe(1)
    expect(barelyShort.shortfall).toBe(true)
  })

  it('does not flag a shortfall when the unit is g', () => {
    expect(estimateQuantity({ ...paper, quantityOnHand: 1, unit: 'g' }).shortfall).toBe(false)
  })

  it('does not flag a shortfall when enough millilitres are on hand', () => {
    expect(estimateQuantity({ ...paper, quantityOnHand: 50, unit: 'ml' }).shortfall).toBe(false)
    expect(estimateQuantity({ ...paper, quantityOnHand: 80, unit: 'ml' }).shortfall).toBe(false)
  })
})
