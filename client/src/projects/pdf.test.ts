import { PDFDocument, PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { buildProjectPdf } from './pdf.ts'

const TINY_PNG = decodeBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
)

describe('buildProjectPdf', () => {
  it('builds an A4 outline page followed by a color-key page', async () => {
    const bytes = await buildProjectPdf({
      title: 'Roses',
      colorCount: 2,
      width: 20,
      height: 10,
      chains: {
        points: new Float32Array([0, 5, 20, 5]),
        offsets: new Uint32Array([0, 2]),
      },
      labels: [{ number: 1, x: 5, y: 3, fontPx: 4, radius: 2 }],
      colorPreviewPng: TINY_PNG,
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 10,
      legend: [
        { number: 1, hex: '#ff0000', paintLabel: 'Cadmium Red', estimatedMl: 1.25, shortfall: false },
        { number: 2, hex: '#0000ff', paintLabel: null, estimatedMl: 0.4, shortfall: true },
      ],
    })

    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    const page = doc.getPage(0)
    expect(Math.abs(page.getWidth() - (210 * 72) / 25.4)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(page.getHeight() - (297 * 72) / 25.4)).toBeLessThanOrEqual(0.2)
    const key = doc.getPage(1)
    expect(Math.abs(key.getWidth() - (210 * 72) / 25.4)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(key.getHeight() - (297 * 72) / 25.4)).toBeLessThanOrEqual(0.2)
  })

  it('draws the footer, a short row, and the scale bar label', async () => {
    const drawn: string[] = []
    const original = PDFPage.prototype.drawText
    PDFPage.prototype.drawText = function (text, options) {
      drawn.push(String(text))
      return original.call(this, text, options)
    }
    try {
      await buildProjectPdf({
        title: 'Roses',
        colorCount: 2,
        width: 20,
        height: 10,
        chains: {
          points: new Float32Array([0, 5, 20, 5]),
          offsets: new Uint32Array([0, 2]),
        },
        labels: [{ number: 1, x: 5, y: 3, fontPx: 4, radius: 2 }],
        colorPreviewPng: TINY_PNG,
        paperWidthMm: 210,
        paperHeightMm: 297,
        marginMm: 10,
        legend: [
          { number: 1, hex: '#ff0000', paintLabel: 'Cadmium Red', estimatedMl: 1.25, shortfall: false },
          { number: 2, hex: '#0000ff', paintLabel: null, estimatedMl: 0.4, shortfall: true },
        ],
      })
    } finally {
      PDFPage.prototype.drawText = original
    }
    expect(drawn.some((text) => text.includes('Roses') && text.includes('Print at 100%'))).toBe(true)
    expect(drawn).toContain('Short')
    expect(drawn.some((text) => text.includes('50 mm') && text.includes('check your print scale'))).toBe(true)
  })
})

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}
