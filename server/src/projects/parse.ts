import { isUuid } from '../ids.js'

const HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const PAPER_PRESETS = ['A5', 'A4', 'A3', 'Letter', 'custom'] as const
const ORIENTATIONS = ['portrait', 'landscape'] as const
const TITLE_MAX = 200
const MAX_COLORS = 100
export const MIN_COLOR_COUNT = 6
export const MAX_COLOR_COUNT = 48
export const DEFAULT_COLOR_COUNT = 24
const DETAILS = ['simple', 'balanced', 'detailed'] as const

export type DetailName = (typeof DETAILS)[number]

export type PaperPresetName = (typeof PAPER_PRESETS)[number]
export type PaperOrientationName = (typeof ORIENTATIONS)[number]

export type ProjectColorWrite = {
  number: number
  hex: string
  paintId: string | null
  areaCm2: string
  estimatedQuantity: string
  shortfall: boolean
}

export type ProjectWrite = {
  title: string
  colorCount: number
  paperPreset: PaperPresetName
  paperWidthMm: string
  paperHeightMm: string
  orientation: PaperOrientationName
  marginMm: string
  coverageRate: string
  cropX: string
  cropY: string
  cropWidth: string
  cropHeight: string
  constrainToOwned: boolean
  colors: ProjectColorWrite[]
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decimalString(value: number): string {
  if (Object.is(value, -0)) return '0'
  return String(value)
}

function parseTitle(value: unknown): ParseResult<string> {
  if (value === undefined || value === null) return { ok: true, value: 'Untitled' }
  if (typeof value !== 'string') return { ok: false, error: 'Invalid title' }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { ok: true, value: 'Untitled' }
  if (trimmed.length > TITLE_MAX) return { ok: false, error: 'Title is too long' }
  return { ok: true, value: trimmed }
}

function parseColorCount(value: unknown): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_COLOR_COUNT || value > MAX_COLOR_COUNT) {
    return { ok: false, error: `Color count must be an integer from ${MIN_COLOR_COUNT} to ${MAX_COLOR_COUNT}` }
  }
  return { ok: true, value }
}

function parsePaperPreset(value: unknown): ParseResult<PaperPresetName> {
  if (typeof value !== 'string' || !(PAPER_PRESETS as readonly string[]).includes(value)) {
    return { ok: false, error: 'Invalid paper preset' }
  }
  return { ok: true, value: value as PaperPresetName }
}

function parseOrientation(value: unknown): ParseResult<PaperOrientationName> {
  if (typeof value !== 'string' || !(ORIENTATIONS as readonly string[]).includes(value)) {
    return { ok: false, error: 'Invalid orientation' }
  }
  return { ok: true, value: value as PaperOrientationName }
}

function parsePositive(value: unknown, field: string): ParseResult<string> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, error: `Invalid ${field}` }
  }
  return { ok: true, value: decimalString(value) }
}

function parseUnitInterval(value: unknown, field: string): ParseResult<number> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return { ok: false, error: `Invalid ${field}` }
  }
  return { ok: true, value }
}

function parseCrop(body: Record<string, unknown>): ParseResult<{
  cropX: string
  cropY: string
  cropWidth: string
  cropHeight: string
}> {
  const cropX = parseUnitInterval(body.cropX, 'crop x')
  if (!cropX.ok) return cropX
  const cropY = parseUnitInterval(body.cropY, 'crop y')
  if (!cropY.ok) return cropY
  const cropWidth = parseUnitInterval(body.cropWidth, 'crop width')
  if (!cropWidth.ok) return cropWidth
  const cropHeight = parseUnitInterval(body.cropHeight, 'crop height')
  if (!cropHeight.ok) return cropHeight
  if (cropWidth.value <= 0 || cropHeight.value <= 0) {
    return { ok: false, error: 'Invalid crop size' }
  }
  if (cropX.value + cropWidth.value > 1.001 || cropY.value + cropHeight.value > 1.001) {
    return { ok: false, error: 'Crop extends outside the photo' }
  }
  return {
    ok: true,
    value: {
      cropX: decimalString(cropX.value),
      cropY: decimalString(cropY.value),
      cropWidth: decimalString(cropWidth.value),
      cropHeight: decimalString(cropHeight.value),
    },
  }
}

function parseNonNegative(value: unknown, field: string): ParseResult<string> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: `Invalid ${field}` }
  }
  return { ok: true, value: decimalString(value) }
}

function parseColor(value: unknown, index: number): ParseResult<ProjectColorWrite> {
  const label = `Color ${index + 1}`
  if (!isRecord(value)) return { ok: false, error: `${label} is invalid` }

  if (typeof value.number !== 'number' || !Number.isInteger(value.number) || value.number < 1) {
    return { ok: false, error: `${label} has an invalid number` }
  }

  if (typeof value.hex !== 'string' || !HEX_RE.test(value.hex.trim())) {
    return { ok: false, error: `${label} has an invalid hex` }
  }

  let paintId: string | null
  if (value.paintId === null || value.paintId === undefined) {
    paintId = null
  } else if (typeof value.paintId === 'string' && isUuid(value.paintId)) {
    paintId = value.paintId
  } else {
    return { ok: false, error: `${label} has an invalid paint` }
  }

  const area = parseNonNegative(value.areaCm2, 'area')
  if (!area.ok) return { ok: false, error: `${label} has an invalid area` }
  const quantity = parseNonNegative(value.estimatedQuantity, 'quantity')
  if (!quantity.ok) return { ok: false, error: `${label} has an invalid quantity` }

  if (typeof value.shortfall !== 'boolean') {
    return { ok: false, error: `${label} has an invalid shortfall` }
  }

  return {
    ok: true,
    value: {
      number: value.number,
      hex: value.hex.trim(),
      paintId,
      areaCm2: area.value,
      estimatedQuantity: quantity.value,
      shortfall: value.shortfall,
    },
  }
}

export function parseProjectPayload(body: unknown): ParseResult<ProjectWrite> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid payload' }

  const title = parseTitle(body.title)
  if (!title.ok) return title
  const colorCount = parseColorCount(body.colorCount)
  if (!colorCount.ok) return colorCount
  const paperPreset = parsePaperPreset(body.paperPreset)
  if (!paperPreset.ok) return paperPreset
  const paperWidthMm = parsePositive(body.paperWidthMm, 'paper width')
  if (!paperWidthMm.ok) return paperWidthMm
  const paperHeightMm = parsePositive(body.paperHeightMm, 'paper height')
  if (!paperHeightMm.ok) return paperHeightMm
  const orientation = parseOrientation(body.orientation)
  if (!orientation.ok) return orientation
  const marginMm = parseNonNegative(body.marginMm, 'margin')
  if (!marginMm.ok) return marginMm
  const coverageRate = parsePositive(body.coverageRate, 'coverage rate')
  if (!coverageRate.ok) return coverageRate
  const crop = parseCrop(body)
  if (!crop.ok) return crop
  if (typeof body.constrainToOwned !== 'boolean') {
    return { ok: false, error: 'Invalid constrainToOwned' }
  }
  if (!Array.isArray(body.colors) || body.colors.length > MAX_COLORS) {
    return { ok: false, error: 'Invalid colors' }
  }

  const colors = parseColorList(body.colors)
  if (!colors.ok) return colors

  return {
    ok: true,
    value: {
      title: title.value,
      colorCount: colorCount.value,
      paperPreset: paperPreset.value,
      paperWidthMm: paperWidthMm.value,
      paperHeightMm: paperHeightMm.value,
      orientation: orientation.value,
      marginMm: marginMm.value,
      coverageRate: coverageRate.value,
      cropX: crop.value.cropX,
      cropY: crop.value.cropY,
      cropWidth: crop.value.cropWidth,
      cropHeight: crop.value.cropHeight,
      constrainToOwned: body.constrainToOwned,
      colors: colors.value,
    },
  }
}

function parseColorList(value: unknown): ParseResult<ProjectColorWrite[]> {
  if (!Array.isArray(value) || value.length > MAX_COLORS) return { ok: false, error: 'Invalid colors' }
  const colors: ProjectColorWrite[] = []
  const seen = new Set<number>()
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseColor(value[index], index)
    if (!parsed.ok) return parsed
    if (seen.has(parsed.value.number) || parsed.value.number > value.length) {
      return { ok: false, error: `Color ${index + 1} has an invalid number` }
    }
    seen.add(parsed.value.number)
    colors.push(parsed.value)
  }
  return { ok: true, value: colors }
}

export type ProjectPatch = {
  title?: string
  colorCount?: number
  detail?: DetailName
  paperPreset?: PaperPresetName
  paperWidthMm?: string
  paperHeightMm?: string
  orientation?: PaperOrientationName
  marginMm?: string
  coverageRate?: string
  crop?:
    | {
        cropX: string
        cropY: string
        cropWidth: string
        cropHeight: string
      }
    | null
  constrainToOwned?: boolean
  colors?: ProjectColorWrite[]
}

export function parseProjectPatch(body: unknown): ParseResult<ProjectPatch> {
  if (!isRecord(body)) return { ok: false, error: 'Invalid payload' }
  const patch: ProjectPatch = {}

  if (Object.hasOwn(body, 'title')) {
    const title = parseTitle(body.title)
    if (!title.ok) return title
    patch.title = title.value === 'Untitled' && (body.title === undefined || body.title === null || body.title === '')
      ? 'Untitled project'
      : title.value
  }
  if (Object.hasOwn(body, 'colorCount')) {
    const colorCount = parseColorCount(body.colorCount)
    if (!colorCount.ok) return colorCount
    patch.colorCount = colorCount.value
  }
  if (Object.hasOwn(body, 'detail')) {
    if (typeof body.detail !== 'string' || !(DETAILS as readonly string[]).includes(body.detail)) {
      return { ok: false, error: 'Invalid detail' }
    }
    patch.detail = body.detail as DetailName
  }
  if (Object.hasOwn(body, 'paperPreset')) {
    const paperPreset = parsePaperPreset(body.paperPreset)
    if (!paperPreset.ok) return paperPreset
    patch.paperPreset = paperPreset.value
  }
  if (Object.hasOwn(body, 'paperWidthMm')) {
    const paperWidthMm = parsePositive(body.paperWidthMm, 'paper width')
    if (!paperWidthMm.ok) return paperWidthMm
    patch.paperWidthMm = paperWidthMm.value
  }
  if (Object.hasOwn(body, 'paperHeightMm')) {
    const paperHeightMm = parsePositive(body.paperHeightMm, 'paper height')
    if (!paperHeightMm.ok) return paperHeightMm
    patch.paperHeightMm = paperHeightMm.value
  }
  if (Object.hasOwn(body, 'orientation')) {
    const orientation = parseOrientation(body.orientation)
    if (!orientation.ok) return orientation
    patch.orientation = orientation.value
  }
  if (Object.hasOwn(body, 'marginMm')) {
    const marginMm = parseNonNegative(body.marginMm, 'margin')
    if (!marginMm.ok) return marginMm
    patch.marginMm = marginMm.value
  }
  if (Object.hasOwn(body, 'coverageRate')) {
    const coverageRate = parsePositive(body.coverageRate, 'coverage rate')
    if (!coverageRate.ok) return coverageRate
    patch.coverageRate = coverageRate.value
  }
  if (Object.hasOwn(body, 'constrainToOwned')) {
    if (typeof body.constrainToOwned !== 'boolean') return { ok: false, error: 'Invalid constrainToOwned' }
    patch.constrainToOwned = body.constrainToOwned
  }
  if (Object.hasOwn(body, 'crop')) {
    if (body.crop === null) {
      patch.crop = null
    } else if (isRecord(body.crop)) {
      const crop = parseCrop({
        cropX: body.crop.x,
        cropY: body.crop.y,
        cropWidth: body.crop.width,
        cropHeight: body.crop.height,
      })
      if (!crop.ok) return crop
      patch.crop = crop.value
    } else {
      return { ok: false, error: 'Invalid crop' }
    }
  } else if (
    Object.hasOwn(body, 'cropX') ||
    Object.hasOwn(body, 'cropY') ||
    Object.hasOwn(body, 'cropWidth') ||
    Object.hasOwn(body, 'cropHeight')
  ) {
    const crop = parseCrop(body)
    if (!crop.ok) return crop
    patch.crop = crop.value
  }
  if (Object.hasOwn(body, 'colors')) {
    const colors = parseColorList(body.colors)
    if (!colors.ok) return colors
    patch.colors = colors.value
  }

  return { ok: true, value: patch }
}

export function validateMergedProject(input: {
  paperPreset: string | null
  paperWidthMm: number | null
  paperHeightMm: number | null
  marginMm: number | null
}): ParseResult<true> {
  if (input.paperPreset === 'custom' && (!(input.paperWidthMm && input.paperWidthMm > 0) || !(input.paperHeightMm && input.paperHeightMm > 0))) {
    return { ok: false, error: 'Custom paper needs a width and height' }
  }
  if (input.paperWidthMm && input.paperHeightMm && input.marginMm !== null) {
    const shorter = Math.min(input.paperWidthMm, input.paperHeightMm)
    if (!(input.marginMm < shorter / 2)) return { ok: false, error: 'Margin is too large for this paper' }
  }
  return { ok: true, value: true }
}
