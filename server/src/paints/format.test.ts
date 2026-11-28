import { describe, expect, it } from 'vitest'
import type { Paint } from '../db/schema.js'
import { paintsToCsv, parseCsvPaints } from './csv.js'
import { toExportJson, toPaintJson } from './json.js'
import { parseCreateBody, parseImportRecords, parsePatchBody } from './parse.js'

const paint = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  manufacturer: 'Winsor',
  productLine: 'Gal',
  manufacturerCode: 'W&N "074"',
  label: 'Red, deep',
  hex: '#aa1122',
  quantityOnHand: '2.50',
  unit: 'ml',
  notes: 'line\nquote "here"',
  referenceFileId: '33333333-3333-4333-8333-333333333333',
  createdAt: new Date('2020-01-01T00:00:00.000Z'),
  updatedAt: new Date('2020-01-02T00:00:00.000Z'),
} satisfies Paint

describe('paint json', () => {
  it('returns quantity as a number and omits the owner from export', () => {
    expect(toExportJson(paint)).toEqual({
      id: paint.id,
      manufacturer: 'Winsor',
      productLine: 'Gal',
      manufacturerCode: 'W&N "074"',
      label: 'Red, deep',
      hex: '#aa1122',
      quantityOnHand: 2.5,
      unit: 'ml',
      notes: 'line\nquote "here"',
    })
    expect(toExportJson(paint)).not.toHaveProperty('userId')
    expect(toExportJson(paint)).not.toHaveProperty('referenceFileId')

    const json = toPaintJson(paint)
    expect(json.quantityOnHand).toBe(2.5)
    expect(json.referenceFileId).toBe(paint.referenceFileId)
    expect(json).not.toHaveProperty('userId')
  })
})

describe('paint input', () => {
  it('turns an empty hex into null and rejects a bad hex', () => {
    expect(parseCreateBody({ hex: '', label: 'Lake' })).toEqual({
      ok: true,
      value: {
        manufacturer: null,
        productLine: null,
        manufacturerCode: null,
        label: 'Lake',
        hex: null,
        quantityOnHand: null,
        unit: null,
        notes: null,
      },
    })
    expect(parseCreateBody({ hex: '#abc' }).ok).toBe(false)
    expect(parseCreateBody({ hex: '#aabbcc' }).ok).toBe(true)
    expect(parseCreateBody({ hex: '#aabbccdd' }).ok).toBe(true)
    expect(parsePatchBody({ quantityOnHand: 4 })).toEqual({
      ok: true,
      value: { quantityOnHand: '4' },
    })
    expect(parsePatchBody({ quantityOnHand: '' })).toEqual({
      ok: true,
      value: { quantityOnHand: null },
    })
  })

  it('rejects text fields over their length limits', () => {
    expect(parseCreateBody({ label: 'a'.repeat(120) }).ok).toBe(true)
    expect(parseCreateBody({ label: 'a'.repeat(121) })).toEqual({ ok: false, error: 'label is too long' })
    expect(parseCreateBody({ manufacturer: 'a'.repeat(121) }).ok).toBe(false)
    expect(parseCreateBody({ productLine: 'a'.repeat(121) }).ok).toBe(false)
    expect(parseCreateBody({ manufacturerCode: 'a'.repeat(121) }).ok).toBe(false)
    expect(parseCreateBody({ unit: 'a'.repeat(121) }).ok).toBe(false)
    expect(parseCreateBody({ notes: 'a'.repeat(2000) }).ok).toBe(true)
    expect(parseCreateBody({ notes: 'a'.repeat(2001) })).toEqual({ ok: false, error: 'notes is too long' })
    expect(parsePatchBody({ label: 'a'.repeat(121) }).ok).toBe(false)
  })

  it('ignores ids on JSON import', () => {
    const parsed = parseImportRecords([
      { id: 'not-used', label: 'Ochre', quantityOnHand: '1.25', userId: 'other' },
    ])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toEqual([
      {
        manufacturer: null,
        productLine: null,
        manufacturerCode: null,
        label: 'Ochre',
        hex: null,
        quantityOnHand: '1.25',
        unit: null,
        notes: null,
      },
    ])
  })
})

describe('paint csv', () => {
  it('escapes quotes and rejects a missing header', () => {
    const csv = paintsToCsv([
      {
        manufacturer: 'Winsor',
        productLine: 'Gal',
        manufacturerCode: 'W&N "074"',
        label: 'Red, deep',
        hex: '#aa1122',
        quantityOnHand: '2.50',
        unit: 'ml',
        notes: 'line\nquote "here"',
      },
    ])
    expect(csv.startsWith(
      'manufacturer,productLine,manufacturerCode,label,hex,quantityOnHand,unit,notes\n',
    )).toBe(true)
    expect(csv).toContain('"W&N ""074"""')
    expect(csv).toContain('"Red, deep"')
    expect(csv).toContain('"line\nquote ""here"""')

    const parsed = parseCsvPaints(csv)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value[0]?.manufacturerCode).toBe('W&N "074"')
    expect(parsed.value[0]?.label).toBe('Red, deep')
    expect(parsed.value[0]?.notes).toBe('line\nquote "here"')
    expect(parsed.value[0]?.quantityOnHand).toBe('2.50')

    expect(parseCsvPaints('label,hex\nLake,#fff\n')).toEqual({
      ok: false,
      error: 'CSV header is missing',
    })
    expect(parseCsvPaints('')).toEqual({ ok: false, error: 'CSV header is missing' })
  })
})
