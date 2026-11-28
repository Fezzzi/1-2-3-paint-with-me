import { PDFDocument, StandardFonts, LineCapStyle, LineJoinStyle, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, moveTo, lineTo, setLineWidth, setLineCap, setLineJoin, setStrokingColor, stroke, type PDFFont, type PDFPage } from 'pdf-lib'
import type { LabelPlacement, VectorChains } from '../processing/engine/types.ts'

export type ProjectPdfLegendRow = {
  number: number
  hex: string
  paintLabel: string | null
  estimatedMl: number
  shortfall: boolean
}

export type ProjectPdfInput = {
  title: string
  colorCount: number
  width: number
  height: number
  chains: VectorChains
  labels: readonly LabelPlacement[]
  colorPreviewPng: Uint8Array
  legend: readonly ProjectPdfLegendRow[]
  paperWidthMm: number
  paperHeightMm: number
  marginMm: number
}

const MM_TO_POINTS = 72 / 25.4
const outlineGray = rgb(0x6b / 255, 0x6b / 255, 0x6b / 255)
const labelGray = rgb(0x7a / 255, 0x7a / 255, 0x7a / 255)
const black = rgb(0, 0, 0)

export function mmToPoints(mm: number): number {
  return mm * MM_TO_POINTS
}

export function pdfFile(bytes: Uint8Array, filename: string): File {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new File([copy], filename, { type: 'application/pdf' })
}

export async function buildProjectPdf(input: ProjectPdfInput): Promise<Uint8Array> {
  if (!(input.paperWidthMm > 0) || !(input.paperHeightMm > 0) || !(input.marginMm >= 0)) {
    throw new Error('Paper size is not valid.')
  }
  if (!(input.width > 0) || !(input.height > 0)) throw new Error('Outline is empty.')
  if (input.colorPreviewPng.byteLength === 0) throw new Error('Color preview is empty.')

  const pageWidth = mmToPoints(input.paperWidthMm)
  const pageHeight = mmToPoints(input.paperHeightMm)
  const margin = mmToPoints(input.marginMm)
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2
  if (printableWidth < 1 || printableHeight < 1) throw new Error('Margins are larger than the paper.')

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const preview = await doc.embedPng(input.colorPreviewPng)
  const outline = doc.addPage([pageWidth, pageHeight])
  drawOutlinePage(outline, font, input, margin, printableWidth, printableHeight)
  drawColorKey(doc, font, preview, input, pageWidth, pageHeight, margin, printableWidth)
  return doc.save()
}

function drawOutlinePage(
  page: PDFPage,
  font: PDFFont,
  input: ProjectPdfInput,
  margin: number,
  printableWidth: number,
  printableHeight: number,
) {
  const scaleX = printableWidth / input.width
  const scaleY = printableHeight / input.height
  const originX = margin
  const originY = margin + printableHeight
  const strokeWidth = mmToPoints(0.2) / Math.min(scaleX, scaleY)
  const operators = [
    pushGraphicsState(),
    concatTransformationMatrix(scaleX, 0, 0, -scaleY, originX, originY),
    setLineWidth(strokeWidth),
    setLineCap(LineCapStyle.Round),
    setLineJoin(LineJoinStyle.Round),
    setStrokingColor(outlineGray),
  ]
  const { points, offsets } = input.chains
  for (let chain = 0; chain < offsets.length - 1; chain += 1) {
    const start = offsets[chain] ?? 0
    const end = offsets[chain + 1] ?? start
    if (end - start < 2) continue
    operators.push(moveTo(points[start * 2] ?? 0, points[start * 2 + 1] ?? 0))
    for (let index = start + 1; index < end; index += 1) {
      operators.push(lineTo(points[index * 2] ?? 0, points[index * 2 + 1] ?? 0))
    }
  }
  operators.push(stroke(), popGraphicsState())
  page.pushOperators(...operators)

  page.drawRectangle({
    x: margin,
    y: margin,
    width: printableWidth,
    height: printableHeight,
    borderColor: outlineGray,
    borderWidth: mmToPoints(0.2),
  })

  for (const label of input.labels) {
    const text = String(label.number)
    const fontSize = Math.max(1, label.fontPx * scaleX)
    const pdfX = originX + label.x * scaleX
    const pdfY = originY - (label.y + label.fontPx * 0.36) * scaleY
    const textWidth = font.widthOfTextAtSize(text, fontSize)
    page.drawText(text, {
      x: pdfX - textWidth / 2,
      y: pdfY,
      size: fontSize,
      font,
      color: labelGray,
    })
  }

  if (input.marginMm >= 6) {
    const footer = winAnsiText(font, `${input.title} · ${input.colorCount} colors · Print at 100% (actual size)`)
    const size = 8
    const footerWidth = font.widthOfTextAtSize(footer, size)
    page.drawText(footer, {
      x: Math.max(margin, (page.getWidth() - footerWidth) / 2),
      y: Math.max(2, (margin - size) / 2),
      size,
      font,
      color: labelGray,
    })
  }
}

function drawColorKey(
  doc: PDFDocument,
  font: PDFFont,
  preview: Awaited<ReturnType<PDFDocument['embedPng']>>,
  input: ProjectPdfInput,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  printableWidth: number,
) {
  const fontSize = 10
  const rowHeight = mmToPoints(12)
  const swatchSize = mmToPoints(8)
  const scaleBarSpace = mmToPoints(16)
  let page = doc.addPage([pageWidth, pageHeight])
  let cursor = pageHeight - margin
  const imageHeight = Math.min(mmToPoints(55), printableWidth * (input.height / input.width))
  const imageWidth = imageHeight * (input.width / input.height)
  page.drawImage(preview, { x: margin, y: cursor - imageHeight, width: imageWidth, height: imageHeight })
  cursor -= imageHeight + mmToPoints(6)
  drawScaleBar(page, font, margin, margin + mmToPoints(4))

  for (const row of input.legend) {
    if (cursor - rowHeight < margin + scaleBarSpace) {
      page = doc.addPage([pageWidth, pageHeight])
      cursor = pageHeight - margin
    }
    drawLegendRow(page, font, row, cursor - fontSize, margin, pageWidth, fontSize, swatchSize)
    cursor -= rowHeight
  }
}

function drawScaleBar(page: PDFPage, font: PDFFont, x: number, y: number) {
  const length = mmToPoints(50)
  page.drawLine({ start: { x, y }, end: { x: x + length, y }, thickness: 1, color: black })
  page.drawLine({ start: { x, y: y - 3 }, end: { x, y: y + 3 }, thickness: 1, color: black })
  page.drawLine({ start: { x: x + length, y: y - 3 }, end: { x: x + length, y: y + 3 }, thickness: 1, color: black })
  page.drawText(winAnsiText(font, '50 mm — check your print scale'), {
    x,
    y: y - 12,
    size: 8,
    font,
    color: black,
  })
}

function drawLegendRow(
  page: PDFPage,
  font: PDFFont,
  row: ProjectPdfLegendRow,
  baseline: number,
  margin: number,
  pageWidth: number,
  fontSize: number,
  swatchSize: number,
) {
  const quantity = formatMl(row.estimatedMl)
  const shortText = row.shortfall ? 'Short' : ''
  const right = pageWidth - margin
  const shortWidth = shortText ? font.widthOfTextAtSize(shortText, fontSize) : 0
  const quantityWidth = font.widthOfTextAtSize(quantity, fontSize)
  const shortX = right - shortWidth
  const quantityX = right - shortWidth - (shortText ? 8 : 0) - quantityWidth
  const swatchX = margin + mmToPoints(10)
  const hexX = swatchX + swatchSize + 6
  const hex = fitWidth(font, row.hex, fontSize, Math.max(quantityX - hexX - 8, 0))
  const hexWidth = hex ? font.widthOfTextAtSize(hex, fontSize) : 0
  const labelX = hexX + hexWidth + (hex ? 8 : 0)
  const label = row.paintLabel?.trim() ? fitWidth(font, row.paintLabel.trim(), fontSize, Math.max(quantityX - 8 - labelX, 0)) : ''

  page.drawText(fitWidth(font, String(row.number), fontSize, mmToPoints(9)), {
    x: margin,
    y: baseline,
    size: fontSize,
    font,
    color: black,
  })
  page.drawRectangle({
    x: swatchX,
    y: baseline - 1,
    width: swatchSize,
    height: swatchSize,
    color: swatchColor(row.hex),
    borderColor: black,
    borderWidth: 0.4,
  })
  if (hex) page.drawText(hex, { x: hexX, y: baseline, size: fontSize, font, color: black })
  if (label) page.drawText(label, { x: labelX, y: baseline, size: fontSize, font, color: black })
  page.drawText(quantity, { x: quantityX, y: baseline, size: fontSize, font, color: black })
  if (shortText) page.drawText(shortText, { x: shortX, y: baseline, size: fontSize, font, color: black })
}

function formatMl(value: number): string {
  if (!Number.isFinite(value)) return '0 ml'
  const digits = Math.abs(value) >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ml`
}

function swatchColor(hex: string) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match?.[1]) return rgb(0.8, 0.8, 0.8)
  const value = match[1]
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  )
}

function winAnsiText(font: PDFFont, value: string): string {
  let result = ''
  for (const char of value) {
    const next = char === '\n' || char === '\r' || char === '\t' ? ' ' : char
    try {
      font.encodeText(next)
      result += next
    } catch {
      result += '?'
    }
  }
  return result
}

function fitWidth(font: PDFFont, value: string, size: number, maxWidth: number): string {
  const text = winAnsiText(font, value)
  if (maxWidth <= 0 || text.length === 0) return ''
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  const ellipsis = '...'
  const ellipsisWidth = font.widthOfTextAtSize(ellipsis, size)
  if (ellipsisWidth > maxWidth) return ''
  let end = text.length
  while (end > 0 && font.widthOfTextAtSize(text.slice(0, end), size) + ellipsisWidth > maxWidth) end -= 1
  return end === 0 ? '' : `${text.slice(0, end)}${ellipsis}`
}
