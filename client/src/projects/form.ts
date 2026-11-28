import type { CropNorm } from '../processing/crop.ts'
import { COVERAGE_ML_PER_CM2, DEFAULT_COLOR_COUNT, MAX_COLOR_COUNT, MIN_COLOR_COUNT } from '../processing/defaults.ts'
import { PAPER_PRESETS_MM, paperSizeMm, type PaperOrientation, type PaperPreset } from '../processing/paper.ts'
import type { ProjectJson } from './api.ts'

export type PaperChoice = PaperPreset | 'custom'

export type ProjectForm = {
  title: string
  colorCount: number
  paperPreset: PaperChoice
  orientation: PaperOrientation
  customWidth: string
  customHeight: string
  marginMm: string
  constrainToOwned: boolean
}

export type ParsedProjectSettings = {
  colorCount: number
  paperPreset: PaperChoice
  paperWidthMm: number
  paperHeightMm: number
  orientation: PaperOrientation
  marginMm: number
  coverageRate: number
  constrainToOwned: boolean
  crop: CropNorm
}

export const initialForm: ProjectForm = {
  title: '',
  colorCount: DEFAULT_COLOR_COUNT,
  paperPreset: 'A4',
  orientation: 'portrait',
  customWidth: '210',
  customHeight: '297',
  marginMm: '10',
  constrainToOwned: false,
}

const PAPER_CHOICES: readonly PaperChoice[] = ['A5', 'A4', 'A3', 'Letter', 'custom']
const PLACEHOLDER_CROP: CropNorm = { x: 0, y: 0, width: 1, height: 1 }

export function isPaperChoice(value: string | null): value is PaperChoice {
  return value !== null && (PAPER_CHOICES as readonly string[]).includes(value)
}

function clampColorCount(value: number): number {
  if (!Number.isInteger(value)) return initialForm.colorCount
  return Math.min(MAX_COLOR_COUNT, Math.max(MIN_COLOR_COUNT, value))
}

function parseDecimal(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function pageSizeFromForm(form: ProjectForm): { widthMm: number; heightMm: number } | null {
  try {
    if (form.paperPreset === 'custom') {
      const widthMm = parseDecimal(form.customWidth)
      const heightMm = parseDecimal(form.customHeight)
      if (widthMm === null || heightMm === null) return null
      return paperSizeMm({ widthMm, heightMm }, form.orientation)
    }
    return paperSizeMm(form.paperPreset, form.orientation)
  } catch {
    return null
  }
}

export function formFromProject(project: ProjectJson): ProjectForm {
  const paperPreset = isPaperChoice(project.paperPreset) ? project.paperPreset : 'custom'
  const orientation = project.orientation === 'landscape' ? 'landscape' : 'portrait'
  const presetSize = paperPreset === 'custom' ? null : PAPER_PRESETS_MM[paperPreset]
  return {
    title: project.title,
    colorCount: clampColorCount(project.colorCount),
    paperPreset,
    orientation,
    customWidth:
      paperPreset === 'custom'
        ? project.paperWidthMm === null
          ? ''
          : String(project.paperWidthMm)
        : String(presetSize?.widthMm ?? ''),
    customHeight:
      paperPreset === 'custom'
        ? project.paperHeightMm === null
          ? ''
          : String(project.paperHeightMm)
        : String(presetSize?.heightMm ?? ''),
    marginMm: project.marginMm === null ? '10' : String(project.marginMm),
    constrainToOwned: project.constrainToOwned,
  }
}

export function parseFormSettings(
  form: ProjectForm,
  crop: CropNorm = PLACEHOLDER_CROP,
): { ok: true; value: ParsedProjectSettings } | { ok: false; error: string } {
  if (!Number.isInteger(form.colorCount) || form.colorCount < MIN_COLOR_COUNT || form.colorCount > MAX_COLOR_COUNT) {
    return { ok: false, error: `Color count must be from ${MIN_COLOR_COUNT} to ${MAX_COLOR_COUNT}.` }
  }

  const marginMm = parseDecimal(form.marginMm)
  if (marginMm === null) return { ok: false, error: 'Enter a margin of 0 mm or more.' }

  const size = pageSizeFromForm(form)
  if (!size) return { ok: false, error: 'Enter a custom width and height in millimetres.' }

  return {
    ok: true,
    value: {
      colorCount: form.colorCount,
      paperPreset: form.paperPreset,
      paperWidthMm: size.widthMm,
      paperHeightMm: size.heightMm,
      orientation: form.orientation,
      marginMm,
      coverageRate: COVERAGE_ML_PER_CM2,
      constrainToOwned: form.constrainToOwned,
      crop,
    },
  }
}

export function settingsEqual(left: ParsedProjectSettings, right: ParsedProjectSettings): boolean {
  return (
    left.colorCount === right.colorCount &&
    left.paperPreset === right.paperPreset &&
    left.paperWidthMm === right.paperWidthMm &&
    left.paperHeightMm === right.paperHeightMm &&
    left.orientation === right.orientation &&
    left.marginMm === right.marginMm &&
    left.coverageRate === right.coverageRate &&
    left.constrainToOwned === right.constrainToOwned &&
    left.crop.x === right.crop.x &&
    left.crop.y === right.crop.y &&
    left.crop.width === right.crop.width &&
    left.crop.height === right.crop.height
  )
}

export function titleForSave(title: string): string {
  const trimmed = title.trim()
  return trimmed.length === 0 ? 'Untitled' : trimmed
}
