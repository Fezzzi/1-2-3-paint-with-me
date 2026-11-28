import type { CropNorm } from '../../processing/crop.ts'
import { ENGINE_VERSION } from '../../processing/defaults.ts'

function part(value: number): string {
  return (Math.round(value * 10000) / 10000).toFixed(4)
}

export function analysisKey(sourceFileId: string, crop: CropNorm): string {
  return `${sourceFileId}:${part(crop.x)},${part(crop.y)},${part(crop.width)},${part(crop.height)}:${ENGINE_VERSION}`
}
