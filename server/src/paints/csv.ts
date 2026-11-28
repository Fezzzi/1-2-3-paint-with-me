import { MAX_IMPORT_ROWS, parseCreateBody, type PaintWrite, type ParseResult } from './parse.js'

export const CSV_COLUMNS = [
  'manufacturer',
  'productLine',
  'manufacturerCode',
  'label',
  'hex',
  'quantityOnHand',
  'unit',
  'notes',
] as const

export const CSV_HEADER = CSV_COLUMNS.join(',')

export type CsvPaint = Record<(typeof CSV_COLUMNS)[number], string | null>

function escapeCsv(value: string | null): string {
  if (value === null) return ''
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function paintsToCsv(rows: readonly CsvPaint[]): string {
  const lines = [CSV_HEADER]
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => escapeCsv(row[column])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export function parseCsvPaints(text: string): ParseResult<PaintWrite[]> {
  let records: string[][]
  try {
    records = parseCsvRecords(text)
  } catch {
    return { ok: false, error: 'Invalid CSV' }
  }

  const nonempty = records.filter((record) => record.some((cell) => cell.trim() !== ''))
  if (nonempty.length === 0) return { ok: false, error: 'CSV header is missing' }

  const header = nonempty[0]?.map((cell) => cell.trim()) ?? []
  const headerMatches =
    header.length === CSV_COLUMNS.length && header.every((cell, index) => cell === CSV_COLUMNS[index])
  if (!headerMatches) return { ok: false, error: 'CSV header is missing' }

  if (nonempty.length - 1 > MAX_IMPORT_ROWS) return { ok: false, error: 'Too many rows' }

  const rows: PaintWrite[] = []
  for (let index = 1; index < nonempty.length; index += 1) {
    const record = nonempty[index] ?? []
    if (record.length !== CSV_COLUMNS.length) {
      return { ok: false, error: `Row ${index}: Invalid CSV` }
    }
    const body: Record<string, string> = {}
    for (let column = 0; column < CSV_COLUMNS.length; column += 1) {
      const key = CSV_COLUMNS[column]
      if (!key) continue
      body[key] = record[column] ?? ''
    }
    const parsed = parseCreateBody(body)
    if (!parsed.ok) return { ok: false, error: `Row ${index}: ${parsed.error}` }
    rows.push(parsed.value)
  }

  return { ok: true, value: rows }
}

function parseCsvRecords(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char ?? ''
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      continue
    }
    field += char ?? ''
  }

  if (inQuotes) throw new Error('Invalid CSV')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
