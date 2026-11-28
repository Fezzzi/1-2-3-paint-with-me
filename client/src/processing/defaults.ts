/**
 * Millilitres of paint used per square centimetre of the printed page.
 * The app does not ask for this. Change it here.
 */
export const COVERAGE_ML_PER_CM2 = 0.02

export const MIN_COLOR_COUNT = 6
export const MAX_COLOR_COUNT = 48
export const COLOR_COUNT_PRESETS = [12, 18, 24, 36, 48] as const
export const DEFAULT_COLOR_COUNT = 24

/** Internal max-detail palette. Higher than MAX so cleanup losses can be refilled. */
export const ANALYSIS_COLOR_COUNT = 56

/** Long edge, in pixels, of the cropped photo that is analyzed. */
export const WORKING_MAX_EDGE = 1000

/** Bump to invalidate stored analysis caches. */
export const ENGINE_VERSION = 3

export type DetailLevel = 'simple' | 'balanced' | 'detailed'

export type DetailSettings = {
  minAreaMm2: number
  /** Smallest number size, in millimetres, that a region must be able to hold. */
  labelMinMm: number
  modePasses: number
}

export const DETAIL_LEVELS: Record<DetailLevel, DetailSettings> = {
  simple: { minAreaMm2: 24, labelMinMm: 2, modePasses: 2 },
  balanced: { minAreaMm2: 12, labelMinMm: 1.8, modePasses: 3 },
  detailed: { minAreaMm2: 6, labelMinMm: 1.5, modePasses: 1 },
}

/** Inscribed radius, in mm, that fits a two-digit label at `labelMinMm`. */
export function minRadiusMm(labelMinMm: number): number {
  return (labelMinMm * Math.hypot(0.56 * 2, 0.75)) / 2
}

export const DEFAULT_DETAIL: DetailLevel = 'balanced'
