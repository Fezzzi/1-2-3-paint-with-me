import { ENGINE_VERSION } from '../defaults.ts'
import type { Analysis } from './types.ts'

const MAGIC = [0x50, 0x42, 0x4e, 0x32]

export function encodeAnalysis(analysis: Analysis): Uint8Array {
  const pixels = analysis.width * analysis.height
  const clusters = analysis.k
  if (analysis.indices.length < pixels) throw new Error('Analysis is missing pixel labels.')
  if (analysis.centroids.length < clusters * 3 || analysis.counts.length < clusters) {
    throw new Error('Analysis palette is incomplete.')
  }
  const header = 20
  const bytes = new Uint8Array(header + pixels + clusters * 12 + clusters * 4)
  const view = new DataView(bytes.buffer)
  bytes.set(MAGIC, 0)
  view.setUint32(4, analysis.version, true)
  view.setUint32(8, analysis.width, true)
  view.setUint32(12, analysis.height, true)
  view.setUint32(16, clusters, true)
  bytes.set(analysis.indices.subarray(0, pixels), header)
  const centroidBytes = new Uint8Array(clusters * 12)
  new Float32Array(centroidBytes.buffer).set(analysis.centroids.subarray(0, clusters * 3))
  bytes.set(centroidBytes, header + pixels)
  const countBytes = new Uint8Array(clusters * 4)
  new Uint32Array(countBytes.buffer).set(analysis.counts.subarray(0, clusters))
  bytes.set(countBytes, header + pixels + clusters * 12)
  return bytes
}

export function decodeAnalysis(bytes: Uint8Array): Analysis {
  if (bytes.length < 20) throw new Error('Analysis cache is incomplete.')
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (bytes[index] !== MAGIC[index]) throw new Error('Analysis cache is not recognized.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(4, true)
  const width = view.getUint32(8, true)
  const height = view.getUint32(12, true)
  const clusters = view.getUint32(16, true)
  const pixels = width * height
  const expected = 20 + pixels + clusters * 12 + clusters * 4
  if (bytes.length < expected || width <= 0 || height <= 0) throw new Error('Analysis cache is incomplete.')
  const header = 20
  const indices = bytes.slice(header, header + pixels)
  const centroids = new Float32Array(clusters * 3)
  new Uint8Array(centroids.buffer).set(bytes.subarray(header + pixels, header + pixels + clusters * 12))
  const counts = new Uint32Array(clusters)
  new Uint8Array(counts.buffer).set(bytes.subarray(header + pixels + clusters * 12, expected))
  return { version, width, height, indices, centroids, counts, k: clusters }
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function serializeAnalysis(analysis: Analysis): Promise<Uint8Array> {
  const raw = encodeAnalysis(analysis)
  const compressed = new Blob([ownedBuffer(raw)]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

export async function deserializeAnalysis(bytes: Uint8Array): Promise<Analysis> {
  const stream = new Blob([ownedBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  const raw = new Uint8Array(await new Response(stream).arrayBuffer())
  const analysis = decodeAnalysis(raw)
  if (analysis.version !== ENGINE_VERSION) throw new Error('This analysis was made by an older version of the app.')
  return analysis
}
