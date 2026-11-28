const HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const QUANTITY_RE = /^\d+(?:\.\d+)?$/
export const MAX_IMPORT_ROWS = 2000

const TEXT_FIELDS = [
  'manufacturer',
  'productLine',
  'manufacturerCode',
  'label',
  'unit',
  'notes',
] as const

const TEXT_MAX: Record<(typeof TEXT_FIELDS)[number], number> = {
  manufacturer: 120,
  productLine: 120,
  manufacturerCode: 120,
  label: 120,
  unit: 120,
  notes: 2000,
}

export type PaintWrite = {
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: string | null
  unit: string | null
  notes: string | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseText(value: unknown, field: (typeof TEXT_FIELDS)[number]): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: `Invalid ${field}` }
  const trimmed = value.trim()
  if (trimmed.length > TEXT_MAX[field]) return { ok: false, error: `${field} is too long` }
  return { ok: true, value: trimmed.length === 0 ? null : trimmed }
}

function parseHexField(value: unknown): ParseResult<string | null> {
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: 'Invalid hex' }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true, value: null }
  if (!HEX_RE.test(trimmed)) return { ok: false, error: 'Invalid hex' }
  return { ok: true, value: trimmed }
}

function parseQuantityInput(value: unknown): ParseResult<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'Invalid quantityOnHand' }
    return { ok: true, value: String(value) }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return { ok: true, value: null }
    if (!QUANTITY_RE.test(trimmed)) return { ok: false, error: 'Invalid quantityOnHand' }
    return { ok: true, value: trimmed }
  }
  return { ok: false, error: 'Invalid quantityOnHand' }
}

function parseFields(body: Record<string, unknown>, partial: boolean): ParseResult<Partial<PaintWrite>> {
  const write: Partial<PaintWrite> = {}

  for (const field of TEXT_FIELDS) {
    if (!Object.hasOwn(body, field)) continue
    const parsed = parseText(body[field], field)
    if (!parsed.ok) return parsed
    write[field] = parsed.value
  }

  if (Object.hasOwn(body, 'hex')) {
    const parsed = parseHexField(body.hex)
    if (!parsed.ok) return parsed
    write.hex = parsed.value
  }

  if (Object.hasOwn(body, 'quantityOnHand')) {
    const parsed = parseQuantityInput(body.quantityOnHand)
    if (!parsed.ok) return parsed
    write.quantityOnHand = parsed.value
  }

  if (!partial) {
    for (const field of TEXT_FIELDS) {
      if (!Object.hasOwn(write, field)) write[field] = null
    }
    if (!Object.hasOwn(write, 'hex')) write.hex = null
    if (!Object.hasOwn(write, 'quantityOnHand')) write.quantityOnHand = null
  }

  return { ok: true, value: write }
}

export function parseCreateBody(body: unknown): ParseResult<PaintWrite> {
  if (!isRecord(body)) return { ok: false, error: 'Expected an object' }
  const parsed = parseFields(body, false)
  if (!parsed.ok) return parsed
  return { ok: true, value: parsed.value as PaintWrite }
}

export function parsePatchBody(body: unknown): ParseResult<Partial<PaintWrite>> {
  if (!isRecord(body)) return { ok: false, error: 'Expected an object' }
  return parseFields(body, true)
}

export function parseImportRecords(body: unknown): ParseResult<PaintWrite[]> {
  if (!Array.isArray(body)) return { ok: false, error: 'Expected a JSON array' }
  if (body.length > MAX_IMPORT_ROWS) return { ok: false, error: 'Too many rows' }
  const rows: PaintWrite[] = []
  for (let index = 0; index < body.length; index += 1) {
    const parsed = parseCreateBody(body[index])
    if (!parsed.ok) return { ok: false, error: `Row ${index + 1}: ${parsed.error}` }
    rows.push(parsed.value)
  }
  return { ok: true, value: rows }
}
