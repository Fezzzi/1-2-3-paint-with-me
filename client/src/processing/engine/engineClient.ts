import type { DetailLevel } from '../defaults.ts'
import type { EngineRequest, EngineResponse, ReducePayload } from './protocol.ts'
import type { Analysis } from './types.ts'

export class StaleEngineRequest extends Error {
  constructor() {
    super('Stale engine request')
    this.name = 'StaleEngineRequest'
  }
}

type Pending = {
  type: EngineRequest['type']
  resolve: (message: EngineResponse) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
}

export type EngineClient = {
  analyze(rgba: Uint8ClampedArray, width: number, height: number, onProgress?: (progress: number) => void): Promise<Analysis>
  load(analysisBytes: Uint8Array): Promise<void>
  reduce(options: { colorCount: number; detail: DetailLevel; pxPerMm: number }): Promise<ReducePayload>
  terminate(): void
}

type EnginePort = {
  postMessage(message: EngineRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<EngineResponse>) => void) | null
  onerror: ((event: { error?: unknown; message?: string }) => void) | null
}

export function createEngineClient(port?: EnginePort): EngineClient {
  const worker = port ?? new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 0
  const pending = new Map<number, Pending>()
  const latest = new Map<EngineRequest['type'], number>()

  worker.onmessage = (event: MessageEvent<EngineResponse>) => {
    const message = event.data
    const request = pending.get(message.requestId)
    if (!request) return
    if (message.type === 'progress') {
      if (latest.get(request.type) === message.requestId) request.onProgress?.(message.progress)
      return
    }
    pending.delete(message.requestId)
    if (latest.get(request.type) !== message.requestId) {
      request.reject(new StaleEngineRequest())
      return
    }
    if (message.type === 'error') {
      request.reject(new Error(message.message))
      return
    }
    request.resolve(message)
  }

  worker.onerror = (event: { error?: unknown; message?: string }) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'Could not analyze this photo.')
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  function send(message: EngineRequest, transfer: Transferable[], onProgress?: (progress: number) => void): Promise<EngineResponse> {
    latest.set(message.type, message.requestId)
    return new Promise((resolve, reject) => {
      pending.set(message.requestId, { type: message.type, resolve, reject, onProgress })
      try {
        worker.postMessage(message, transfer)
      } catch (error) {
        pending.delete(message.requestId)
        reject(error instanceof Error ? error : new Error('Could not analyze this photo.'))
      }
    })
  }

  return {
    analyze(rgba, width, height, onProgress) {
      const requestId = ++nextId
      const copy = new Uint8ClampedArray(rgba)
      return send({ requestId, type: 'analyze', rgba: copy, width, height }, [copy.buffer], onProgress).then((message) => {
        if (message.type !== 'analyze') throw new Error('Could not analyze this photo.')
        return message.analysis
      })
    },
    load(analysisBytes) {
      const requestId = ++nextId
      const copy = new Uint8Array(analysisBytes)
      return send({ requestId, type: 'load', analysisBytes: copy }, [copy.buffer]).then((message) => {
        if (message.type !== 'load') throw new Error('Could not load the saved analysis.')
      })
    },
    reduce(options) {
      const requestId = ++nextId
      return send({ requestId, type: 'reduce', ...options }, []).then((message) => {
        if (message.type !== 'reduce') throw new Error('Could not build a preview.')
        return message.result
      })
    },
    terminate() {
      worker.terminate()
      for (const request of pending.values()) request.reject(new StaleEngineRequest())
      pending.clear()
    },
  }
}
