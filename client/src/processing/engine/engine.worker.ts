import { DETAIL_LEVELS } from '../defaults.ts'
import { renderColorPreview } from './color.ts'
import { deserializeAnalysis } from './cache.ts'
import { placeLabels } from './labels.ts'
import { analyze } from './analyze.ts'
import { reduce } from './reduce.ts'
import type { EngineRequest, EngineResponse, ReducePayload } from './protocol.ts'
import type { Analysis } from './types.ts'
import { vectorize } from './vectorize.ts'

type WorkerScope = {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null
  postMessage(message: EngineResponse, transfer?: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope
const queue: EngineRequest[] = []
let busy = false
let current: Analysis | null = null

scope.onmessage = (event: MessageEvent<EngineRequest>) => {
  queue.push(event.data)
  void pump()
}

async function pump(): Promise<void> {
  if (busy) return
  busy = true
  while (queue.length > 0) {
    const request = queue.shift()
    if (!request) break
    await handle(request)
  }
  busy = false
}

async function handle(request: EngineRequest): Promise<void> {
  try {
    if (request.type === 'analyze') {
      current = await analyze(request.rgba, request.width, request.height, (progress) => {
        scope.postMessage({ requestId: request.requestId, type: 'progress', progress })
      })
      scope.postMessage({ requestId: request.requestId, type: 'analyze', analysis: current })
      return
    }
    if (request.type === 'load') {
      current = await deserializeAnalysis(request.analysisBytes)
      scope.postMessage({ requestId: request.requestId, type: 'load' })
      return
    }
    if (!current) throw new Error('Analyze a photo first.')
    const reduction = reduce(current, {
      colorCount: request.colorCount,
      detail: request.detail,
      pxPerMm: request.pxPerMm,
    })
    const chains = vectorize(reduction.labelMap, reduction.width, reduction.height)
    const labels = placeLabels(
      reduction.labelMap,
      reduction.width,
      reduction.height,
      request.pxPerMm,
      DETAIL_LEVELS[request.detail].labelMinMm,
    )
    const result: ReducePayload = {
      labelMap: reduction.labelMap,
      palette: reduction.palette,
      chains,
      labels,
      colorPreviewRgba: renderColorPreview(
        reduction.labelMap,
        reduction.palette.map((color) => color.hex),
        reduction.width,
        reduction.height,
      ),
      limitedBy: reduction.limitedBy,
      width: reduction.width,
      height: reduction.height,
    }
    scope.postMessage({ requestId: request.requestId, type: 'reduce', result }, [result.labelMap.buffer, result.colorPreviewRgba.buffer, result.chains.points.buffer, result.chains.offsets.buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not analyze this photo.'
    scope.postMessage({ requestId: request.requestId, type: 'error', message })
  }
}
