import type { DetailLevel } from '../defaults.ts'

export type Analysis = {
  version: number
  width: number
  height: number
  indices: Uint8Array
  centroids: Float32Array
  counts: Uint32Array
  k: number
}

export type PaletteColor = {
  L: number
  a: number
  b: number
  hex: string
  pixelCount: number
}

export type Reduction = {
  labelMap: Uint8Array
  palette: PaletteColor[]
  limitedBy: 'image' | null
  width: number
  height: number
}

export type ReduceOptions = {
  colorCount: number
  detail: DetailLevel
  pxPerMm: number
}

export type VectorChains = {
  points: Float32Array
  offsets: Uint32Array
}

export type LabelPlacement = {
  number: number
  x: number
  y: number
  fontPx: number
  radius: number
}

export type LimitedBy = 'image' | 'paints' | null
