import type { DetailLevel } from '../defaults.ts'
import type { Analysis, LabelPlacement, LimitedBy, PaletteColor, VectorChains } from './types.ts'

export type ReducePayload = {
  labelMap: Uint8Array
  palette: PaletteColor[]
  chains: VectorChains
  labels: LabelPlacement[]
  colorPreviewRgba: Uint8ClampedArray
  limitedBy: LimitedBy
  width: number
  height: number
}

export type EngineRequest =
  | { requestId: number; type: 'analyze'; rgba: Uint8ClampedArray; width: number; height: number }
  | { requestId: number; type: 'load'; analysisBytes: Uint8Array }
  | { requestId: number; type: 'reduce'; colorCount: number; detail: DetailLevel; pxPerMm: number }

export type EngineResponse =
  | { requestId: number; type: 'progress'; progress: number }
  | { requestId: number; type: 'analyze'; analysis: Analysis }
  | { requestId: number; type: 'load' }
  | { requestId: number; type: 'reduce'; result: ReducePayload }
  | { requestId: number; type: 'error'; message: string }
