import type { PaintInput } from './api.ts'

export type PaintDraft = {
  manufacturer: string
  productLine: string
  manufacturerCode: string
  label: string
  hex: string
  quantityOnHand: string
  unit: string
  notes: string
}

const HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const QUANTITY_RE = /^\d+(?:\.\d+)?$/

export function emptyDraft(): PaintDraft {
  return {
    manufacturer: '',
    productLine: '',
    manufacturerCode: '',
    label: '',
    hex: '',
    quantityOnHand: '',
    unit: '',
    notes: '',
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function isPaintHex(value: string): boolean {
  return HEX_RE.test(value.trim())
}

export function swatchBackground(hex: string | null | undefined): string {
  if (hex && HEX_RE.test(hex.trim())) return hex.trim()
  return '#e0e0e0'
}

export function paintTitle(paint: { label: string | null; manufacturerCode: string | null }): string {
  const label = paint.label?.trim() ?? ''
  if (label) return label
  const code = paint.manufacturerCode?.trim() ?? ''
  if (code) return code
  return 'Untitled'
}

export function paintDetails(manufacturer: string | null, productLine: string | null): string | null {
  const parts = [manufacturer, productLine].map((part) => part?.trim() ?? '').filter((part) => part.length > 0)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function quantityLabel(quantityOnHand: number | null, unit: string | null): string {
  if (quantityOnHand === null) return 'No quantity'
  const unitText = unit?.trim() ?? ''
  return unitText ? `${quantityOnHand} ${unitText}` : String(quantityOnHand)
}

export function draftFromPaint(paint: {
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: number | null
  unit: string | null
  notes: string | null
}): PaintDraft {
  return {
    manufacturer: paint.manufacturer ?? '',
    productLine: paint.productLine ?? '',
    manufacturerCode: paint.manufacturerCode ?? '',
    label: paint.label ?? '',
    hex: paint.hex ?? '',
    quantityOnHand: paint.quantityOnHand === null ? '' : String(paint.quantityOnHand),
    unit: paint.unit ?? '',
    notes: paint.notes ?? '',
  }
}

export function draftToInput(draft: PaintDraft): { ok: true; value: PaintInput } | { ok: false; error: string } {
  const hex = draft.hex.trim()
  if (hex && !HEX_RE.test(hex)) return { ok: false, error: 'Hex must be #rrggbb or #rrggbbaa.' }

  const shortFields = [
    ['manufacturer', 'Manufacturer'],
    ['productLine', 'Product line'],
    ['manufacturerCode', 'Code'],
    ['label', 'Label'],
    ['unit', 'Unit'],
  ] as const
  for (const [field, name] of shortFields) {
    if (draft[field].trim().length > 120) return { ok: false, error: `${name} must be 120 characters or fewer.` }
  }
  if (draft.notes.trim().length > 2000) return { ok: false, error: 'Notes must be 2000 characters or fewer.' }

  const quantityText = draft.quantityOnHand.trim()
  let quantityOnHand: number | null = null
  if (quantityText) {
    if (quantityText.startsWith('-')) return { ok: false, error: 'Quantity must be zero or more.' }
    if (!QUANTITY_RE.test(quantityText)) return { ok: false, error: 'Quantity must be a number.' }
    quantityOnHand = Number(quantityText)
    if (!Number.isFinite(quantityOnHand) || quantityOnHand < 0) {
      return { ok: false, error: quantityOnHand < 0 ? 'Quantity must be zero or more.' : 'Quantity must be a number.' }
    }
  }

  return {
    ok: true,
    value: {
      manufacturer: blankToNull(draft.manufacturer),
      productLine: blankToNull(draft.productLine),
      manufacturerCode: blankToNull(draft.manufacturerCode),
      label: blankToNull(draft.label),
      hex: hex || null,
      quantityOnHand,
      unit: blankToNull(draft.unit),
      notes: blankToNull(draft.notes),
    },
  }
}
