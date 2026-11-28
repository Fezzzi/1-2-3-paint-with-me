import type { Paint } from '../db/schema.js'
import type { CsvPaint } from './csv.js'

export type PaintJson = {
  id: string
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: number | null
  unit: string | null
  notes: string | null
  referenceFileId: string | null
  createdAt: string
  updatedAt: string
}

export type PaintExportJson = {
  id: string
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: number | null
  unit: string | null
  notes: string | null
}

export function quantityToNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function toPaintJson(paint: Paint): PaintJson {
  return {
    id: paint.id,
    manufacturer: paint.manufacturer,
    productLine: paint.productLine,
    manufacturerCode: paint.manufacturerCode,
    label: paint.label,
    hex: paint.hex,
    quantityOnHand: quantityToNumber(paint.quantityOnHand),
    unit: paint.unit,
    notes: paint.notes,
    referenceFileId: paint.referenceFileId,
    createdAt: toIso(paint.createdAt),
    updatedAt: toIso(paint.updatedAt),
  }
}

export function toExportJson(paint: Paint): PaintExportJson {
  return {
    id: paint.id,
    manufacturer: paint.manufacturer,
    productLine: paint.productLine,
    manufacturerCode: paint.manufacturerCode,
    label: paint.label,
    hex: paint.hex,
    quantityOnHand: quantityToNumber(paint.quantityOnHand),
    unit: paint.unit,
    notes: paint.notes,
  }
}

export function toCsvPaint(paint: Paint): CsvPaint {
  return {
    manufacturer: paint.manufacturer,
    productLine: paint.productLine,
    manufacturerCode: paint.manufacturerCode,
    label: paint.label,
    hex: paint.hex,
    quantityOnHand: paint.quantityOnHand,
    unit: paint.unit,
    notes: paint.notes,
  }
}
