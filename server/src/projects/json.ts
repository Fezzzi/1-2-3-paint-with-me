import type { Project, ProjectColor } from '../db/schema.js'

export type ProjectListJson = {
  id: string
  title: string
  status: 'draft' | 'ready'
  colorCount: number
  paperPreset: string | null
  orientation: 'portrait' | 'landscape'
  thumbnailFileId: string | null
  palette: string[]
  updatedAt: string
}

export type ProjectColorJson = {
  id: string
  number: number
  hex: string
  paintId: string | null
  areaCm2: number | null
  estimatedQuantity: number | null
  shortfall: boolean
}

export type ProjectJson = {
  id: string
  title: string
  sourceFileId: string | null
  colorCount: number
  paperPreset: string | null
  paperWidthMm: number | null
  paperHeightMm: number | null
  orientation: 'portrait' | 'landscape'
  marginMm: number | null
  coverageRate: number | null
  cropX: number | null
  cropY: number | null
  cropWidth: number | null
  cropHeight: number | null
  constrainToOwned: boolean
  status: 'draft' | 'ready'
  detail: 'simple' | 'balanced' | 'detailed'
  analysisFileId: string | null
  analysisKey: string | null
  thumbnailFileId: string | null
  createdAt: string
  updatedAt: string
  colors: ProjectColorJson[]
}

export function numericToNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function orientationOf(value: string): 'portrait' | 'landscape' {
  return value === 'landscape' ? 'landscape' : 'portrait'
}

function statusOf(value: string): 'draft' | 'ready' {
  return value === 'ready' ? 'ready' : 'draft'
}

function detailOf(value: string): 'simple' | 'balanced' | 'detailed' {
  if (value === 'simple' || value === 'detailed') return value
  return 'balanced'
}

export function toProjectListJson(project: Project, palette: readonly string[]): ProjectListJson {
  return {
    id: project.id,
    title: project.title,
    status: statusOf(project.status),
    colorCount: project.colorCount,
    paperPreset: project.paperPreset,
    orientation: orientationOf(project.orientation),
    thumbnailFileId: project.thumbnailFileId,
    palette: palette.slice(0, 8),
    updatedAt: toIso(project.updatedAt),
  }
}

export function toProjectColorJson(color: ProjectColor): ProjectColorJson {
  return {
    id: color.id,
    number: color.number,
    hex: color.hex,
    paintId: color.paintId,
    areaCm2: numericToNumber(color.areaCm2),
    estimatedQuantity: numericToNumber(color.estimatedQuantity),
    shortfall: color.shortfall,
  }
}

export function toProjectJson(project: Project, colors: readonly ProjectColor[]): ProjectJson {
  return {
    id: project.id,
    title: project.title,
    sourceFileId: project.sourceFileId,
    colorCount: project.colorCount,
    paperPreset: project.paperPreset,
    paperWidthMm: numericToNumber(project.paperWidthMm),
    paperHeightMm: numericToNumber(project.paperHeightMm),
    orientation: orientationOf(project.orientation),
    marginMm: numericToNumber(project.marginMm),
    coverageRate: numericToNumber(project.coverageRate),
    cropX: numericToNumber(project.cropX),
    cropY: numericToNumber(project.cropY),
    cropWidth: numericToNumber(project.cropWidth),
    cropHeight: numericToNumber(project.cropHeight),
    constrainToOwned: project.constrainToOwned,
    status: statusOf(project.status),
    detail: detailOf(project.detail),
    analysisFileId: project.analysisFileId,
    analysisKey: project.analysisKey,
    thumbnailFileId: project.thumbnailFileId,
    createdAt: toIso(project.createdAt),
    updatedAt: toIso(project.updatedAt),
    colors: colors.map(toProjectColorJson),
  }
}
