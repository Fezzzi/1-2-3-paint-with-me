import { describe, expect, it } from 'vitest'
import { DETAIL_LEVELS } from '../defaults.ts'
import { analyze } from './analyze.ts'
import { deserializeAnalysis, serializeAnalysis } from './cache.ts'
import { ensureDistinctHexes } from './color.ts'
import { createEngineClient, StaleEngineRequest } from './engineClient.ts'
import { placeLabels } from './labels.ts'
import { assignDistinctPaints, hungarianAssign } from './palette.ts'
import { reduce, reductionLimits } from './reduce.ts'
import { cleanupRegions, regionSizeReport } from './regions.ts'
import { mulberry32 } from './random.ts'
import type { EngineResponse } from './protocol.ts'
import { traceBoundaries, vectorize } from './vectorize.ts'

function solid(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgb[0]
    data[index * 4 + 1] = rgb[1]
    data[index * 4 + 2] = rgb[2]
    data[index * 4 + 3] = 255
  }
  return data
}

function gradientNoise(width: number, height: number): Uint8ClampedArray {
  const random = mulberry32(1)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      data[index] = Math.min(255, Math.round((x / Math.max(1, width - 1)) * 255))
      data[index + 1] = Math.min(255, Math.round((y / Math.max(1, height - 1)) * 255))
      data[index + 2] = Math.min(255, Math.round(random() * 255))
      data[index + 3] = 255
    }
  }
  return data
}

describe('analyze', () => {
  it('is deterministic for the same pixels', async () => {
    const image = gradientNoise(24, 24)
    const first = await analyze(image, 24, 24)
    const second = await analyze(image, 24, 24)
    expect(Array.from(first.indices)).toEqual(Array.from(second.indices))
    expect(Array.from(first.centroids)).toEqual(Array.from(second.centroids))
    expect(first.k).toBe(second.k)
  })
})

describe('reduce', () => {
  it('returns exactly N colors on a noisy gradient', async () => {
    const width = 48
    const height = 48
    const analysis = await analyze(gradientNoise(width, height), width, height)
    expect(analysis.k).toBeGreaterThanOrEqual(48)
    for (const colorCount of [6, 12, 24, 48]) {
      const result = reduce(analysis, { colorCount, detail: 'balanced', pxPerMm: 4 })
      expect(result.palette).toHaveLength(colorCount)
      expect(result.limitedBy).toBeNull()
      expect(new Set(result.palette.map((color) => color.hex)).size).toBe(colorCount)
      const seen = new Set<number>()
      for (const value of result.labelMap) seen.add(value)
      expect(seen.size).toBe(colorCount)
    }
  }, 20000)

  it('flags a 3-color image when it cannot reach N', async () => {
    const width = 30
    const height = 30
    const image = solid(width, height, [220, 32, 32])
    for (let y = 0; y < height; y += 1) {
      for (let x = 10; x < 20; x += 1) {
        const offset = (y * width + x) * 4
        image[offset] = 32
        image[offset + 1] = 180
        image[offset + 2] = 48
      }
      for (let x = 20; x < width; x += 1) {
        const offset = (y * width + x) * 4
        image[offset] = 32
        image[offset + 1] = 48
        image[offset + 2] = 210
      }
    }
    const analysis = await analyze(image, width, height)
    const result = reduce(analysis, { colorCount: 12, detail: 'balanced', pxPerMm: 3 })
    expect(result.palette.length).toBeLessThan(12)
    expect(result.limitedBy).toBe('image')
  })
})

describe('cleanupRegions', () => {
  it('removes a region smaller than minArea', () => {
    const width = 8
    const height = 8
    const map = new Int32Array(width * height)
    map[0] = 1
    const palette = new Float32Array([0, 0, 0, 1, 0, 0])
    const cleaned = cleanupRegions(map, width, height, palette, 12, 0, false)
    expect(cleaned.every((value) => value === 0)).toBe(true)
  })

  it('merges adjacent thin strips after their areas sum past minArea', () => {
    const width = 40
    const height = 8
    const map = new Int32Array(width * height)
    for (let x = 0; x < width; x += 1) {
      map[2 * width + x] = 1
      map[3 * width + x] = 2
    }
    const palette = new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0])
    const cleaned = cleanupRegions(map, width, height, palette, 50, 2, false)
    expect(cleaned.every((value) => value === 0)).toBe(true)
  })

  it('keeps the last region of a color in protect mode', () => {
    const width = 8
    const height = 8
    const map = new Int32Array(width * height)
    map[0] = 1
    const palette = new Float32Array([0, 0, 0, 1, 0, 0])
    const cleaned = cleanupRegions(map, width, height, palette, 12, 0, true)
    expect(cleaned[0]).toBe(1)
  })

  it('finishes a 1000×1000 blocked image within 2 seconds', () => {
    const width = 1000
    const height = 1000
    const random = mulberry32(4)
    const map = new Int32Array(width * height)
    const colorCount = 24
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        const color = (random() * colorCount) | 0
        for (let dy = 0; dy < 3 && y + dy < height; dy += 1) {
          for (let dx = 0; dx < 3 && x + dx < width; dx += 1) {
            map[(y + dy) * width + (x + dx)] = color
          }
        }
      }
    }
    const speckles = Math.floor(width * height * 0.05)
    for (let index = 0; index < speckles; index += 1) {
      map[(random() * width * height) | 0] = (random() * colorCount) | 0
    }
    const palette = new Float32Array(colorCount * 3)
    for (let color = 0; color < colorCount; color += 1) {
      palette[color * 3] = color / colorCount
      palette[color * 3 + 1] = ((color * 3) % 7) / 7
      palette[color * 3 + 2] = ((color * 5) % 11) / 11
    }
    const started = performance.now()
    const cleaned = cleanupRegions(map, width, height, palette, 12, 0, false)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(cleaned.length).toBe(width * height)
    const report = regionSizeReport(cleaned, width, height, 12)
    expect(report.undersized).toBe(0)
  })

  it('keeps every final region at least minArea, except a color that exists only as a speck', async () => {
    const width = 48
    const height = 48
    const analysis = await analyze(gradientNoise(width, height), width, height)
    const detail = 'balanced' as const
    const pxPerMm = 4
    const { minArea } = reductionLimits(detail, pxPerMm)
    const result = reduce(analysis, { colorCount: 12, detail, pxPerMm })
    const report = regionSizeReport(result.labelMap, width, height, minArea)
    expect(report.undersized).toBe(0)
    expect(DETAIL_LEVELS[detail].labelMinMm).toBe(1.8)
  })
})

describe('vectorize', () => {
  it('covers every boundary edge once and meets at junctions', () => {
    const width = 4
    const height = 4
    const labels = new Uint8Array([
      0, 0, 1, 1,
      0, 0, 1, 1,
      2, 2, 2, 1,
      2, 2, 1, 1,
    ])
    const expected = boundaryEdges(labels, width, height)
    const chains = traceBoundaries(labels, width, height)
    const seen = new Map<string, number>()
    for (const chain of chains) {
      for (let index = 0; index < chain.points.length - 2; index += 2) {
        const key = edgeKey(chain.points[index] ?? 0, chain.points[index + 1] ?? 0, chain.points[index + 2] ?? 0, chain.points[index + 3] ?? 0)
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
      if (!chain.closed) {
        const start = degreeAt(expected, chain.points[0] ?? 0, chain.points[1] ?? 0)
        const end = degreeAt(expected, chain.points[chain.points.length - 2] ?? 0, chain.points[chain.points.length - 1] ?? 0)
        expect(start).not.toBe(2)
        expect(end).not.toBe(2)
      }
    }
    expect(seen.size).toBe(expected.size)
    for (const [key, count] of seen) {
      expect(expected.has(key)).toBe(true)
      expect(count).toBe(1)
    }
    const smoothed = vectorize(labels, width, height)
    expect(smoothed.offsets.length).toBeGreaterThan(1)
    expect(placeLabels(labels, width, height, 5).length).toBeGreaterThan(0)
  })
})

describe('hungarianAssign', () => {
  it('picks distinct paints and the optimal total', () => {
    const cost = new Float64Array([5, 6, 4, 100])
    const columns = hungarianAssign(cost, 2, 2)
    expect(Array.from(columns)).toEqual([1, 0])
    const assigned = assignDistinctPaints(['#ff0000', '#0000ff'], [
      { id: 'blue', hex: '#0000ff' },
      { id: 'red', hex: '#ff0000' },
      { id: 'blank', hex: null },
    ])
    expect(assigned.map((paint) => paint.id)).toEqual(['red', 'blue'])
    const greedyTrap = new Float64Array([1, 2, 3, 2, 2, 1])
    const trap = hungarianAssign(greedyTrap, 2, 3)
    const total = (greedyTrap[trap[0] ?? 0] ?? 0) + (greedyTrap[3 + (trap[1] ?? 0)] ?? 0)
    expect(total).toBe(2)
    expect(trap[0]).not.toBe(trap[1])
  })
})

describe('engine client', () => {
  it('ignores a superseded request', async () => {
    const port = {
      onmessage: null as ((event: MessageEvent<EngineResponse>) => void) | null,
      onerror: null,
      postMessage() {},
      terminate() {},
    }
    const client = createEngineClient(port)
    const first = client.reduce({ colorCount: 12, detail: 'balanced', pxPerMm: 4 })
    const second = client.reduce({ colorCount: 24, detail: 'balanced', pxPerMm: 4 })
    const result = {
      labelMap: new Uint8Array([0]),
      palette: [],
      chains: { points: new Float32Array(), offsets: new Uint32Array([0]) },
      labels: [],
      colorPreviewRgba: new Uint8ClampedArray(4),
      limitedBy: null,
      width: 1,
      height: 1,
    }
    port.onmessage?.({ data: { requestId: 1, type: 'reduce', result } } as unknown as MessageEvent<EngineResponse>)
    await expect(first).rejects.toBeInstanceOf(StaleEngineRequest)
    port.onmessage?.({ data: { requestId: 2, type: 'reduce', result } } as unknown as MessageEvent<EngineResponse>)
    await expect(second).resolves.toEqual(result)
    client.terminate()
  })
})

describe('analysis cache', () => {
  it('round-trips through gzip', async () => {
    const analysis = await analyze(solid(6, 4, [10, 20, 30]), 6, 4)
    const bytes = await serializeAnalysis(analysis)
    const restored = await deserializeAnalysis(bytes)
    expect(restored.version).toBe(analysis.version)
    expect(restored.width).toBe(analysis.width)
    expect(restored.height).toBe(analysis.height)
    expect(restored.k).toBe(analysis.k)
    expect(Array.from(restored.indices)).toEqual(Array.from(analysis.indices))
    expect(Array.from(restored.centroids)).toEqual(Array.from(analysis.centroids))
    expect(Array.from(restored.counts)).toEqual(Array.from(analysis.counts))
  })
})

describe('ensureDistinctHexes', () => {
  it('nudges the lighter collision', () => {
    const colors = [
      { L: 0.2, hex: '#112233' },
      { L: 0.8, hex: '#112233' },
    ]
    ensureDistinctHexes(colors)
    expect(colors[0]?.hex).toBe('#112233')
    expect(colors[1]?.hex).not.toBe('#112233')
    expect(new Set(colors.map((color) => color.hex)).size).toBe(2)
  })
})

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 > x2 || (x1 === x2 && y1 > y2)) return `${x2},${y2}-${x1},${y1}`
  return `${x1},${y1}-${x2},${y2}`
}

function boundaryEdges(labels: Uint8Array, width: number, height: number): Set<string> {
  const edges = new Set<string>()
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((labels[y * width + x] ?? 0) !== (labels[(y - 1) * width + x] ?? 0)) edges.add(edgeKey(x, y, x + 1, y))
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      if ((labels[y * width + x] ?? 0) !== (labels[y * width + x - 1] ?? 0)) edges.add(edgeKey(x, y, x, y + 1))
    }
  }
  return edges
}

function degreeAt(edges: Set<string>, x: number, y: number): number {
  let degree = 0
  for (const key of edges) {
    const [start, end] = key.split('-')
    if (start === `${x},${y}` || end === `${x},${y}`) degree += 1
  }
  return degree
}
