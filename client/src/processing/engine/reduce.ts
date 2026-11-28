import { DETAIL_LEVELS, minRadiusMm, type DetailLevel } from '../defaults.ts'
import { ensureDistinctHexes, oklabToHex } from './color.ts'
import { cleanupRegions, modeFilter } from './regions.ts'
import type { Analysis, PaletteColor, ReduceOptions, Reduction } from './types.ts'

type WardMerge = { into: number; from: number }

export type ReduceTimings = {
  ward: number
  mode: number
  cleanup: number
  finisher: number
}

export function reductionLimits(detail: DetailLevel, pxPerMm: number): { minArea: number; minRadius: number } {
  const settings = DETAIL_LEVELS[detail]
  const scale = Number.isFinite(pxPerMm) && pxPerMm > 0 ? pxPerMm : 1
  return {
    minArea: Math.max(12, settings.minAreaMm2 * scale * scale),
    minRadius: Math.max(0, minRadiusMm(settings.labelMinMm) * scale),
  }
}

const wardCache = new WeakMap<Analysis, WardMerge[]>()

function wardMerges(analysis: Analysis): WardMerge[] {
  const cached = wardCache.get(analysis)
  if (cached) return cached

  const k = analysis.k
  const centroid = new Float64Array(k * 3)
  centroid.set(analysis.centroids.subarray(0, k * 3))
  const counts = new Float64Array(k)
  counts.set(analysis.counts.subarray(0, k))
  const alive = new Uint8Array(k).fill(1)
  const merges: WardMerge[] = []

  for (let step = 0; step < k - 1; step += 1) {
    let bestInto = -1
    let bestFrom = -1
    let bestCost = Number.POSITIVE_INFINITY
    for (let left = 0; left < k; left += 1) {
      if (!alive[left]) continue
      for (let right = left + 1; right < k; right += 1) {
        if (!alive[right]) continue
        const dL = (centroid[left * 3] ?? 0) - (centroid[right * 3] ?? 0)
        const dA = (centroid[left * 3 + 1] ?? 0) - (centroid[right * 3 + 1] ?? 0)
        const dB = (centroid[left * 3 + 2] ?? 0) - (centroid[right * 3 + 2] ?? 0)
        const leftCount = counts[left] ?? 0
        const rightCount = counts[right] ?? 0
        const cost = ((leftCount * rightCount) / (leftCount + rightCount)) * (dL * dL + dA * dA + dB * dB)
        if (cost < bestCost) {
          bestCost = cost
          bestInto = left
          bestFrom = right
        }
      }
    }
    if (bestInto < 0 || bestFrom < 0) break
    const intoCount = counts[bestInto] ?? 0
    const fromCount = counts[bestFrom] ?? 0
    const total = intoCount + fromCount
    if (total > 0) {
      for (let channel = 0; channel < 3; channel += 1) {
        centroid[bestInto * 3 + channel] =
          ((centroid[bestInto * 3 + channel] ?? 0) * intoCount + (centroid[bestFrom * 3 + channel] ?? 0) * fromCount) / total
      }
    }
    counts[bestInto] = total
    alive[bestFrom] = 0
    merges.push({ into: bestInto, from: bestFrom })
  }

  wardCache.set(analysis, merges)
  return merges
}

function cutAt(k: number, merges: readonly WardMerge[], groups: number): Int32Array {
  const parent = new Int32Array(k)
  for (let index = 0; index < k; index += 1) parent[index] = index
  const find = (start: number): number => {
    let root = start
    while (parent[root] !== root) root = parent[root] ?? root
    let cursor = start
    while (parent[cursor] !== root) {
      const next = parent[cursor] ?? root
      parent[cursor] = root
      cursor = next
    }
    return root
  }
  const steps = Math.max(0, Math.min(merges.length, k - groups))
  for (let step = 0; step < steps; step += 1) {
    const merge = merges[step]
    if (!merge) continue
    parent[find(merge.from)] = find(merge.into)
  }
  const group = new Int32Array(k)
  const ids = new Map<number, number>()
  for (let index = 0; index < k; index += 1) {
    const root = find(index)
    let id = ids.get(root)
    if (id === undefined) {
      id = ids.size
      ids.set(root, id)
    }
    group[index] = id
  }
  return group
}

function groupPalette(analysis: Analysis, group: Int32Array, groups: number): Float32Array {
  const palette = new Float32Array(groups * 3)
  const weight = new Float64Array(groups)
  for (let index = 0; index < analysis.k; index += 1) {
    const slot = group[index] ?? 0
    const count = analysis.counts[index] ?? 0
    weight[slot] = (weight[slot] ?? 0) + count
    palette[slot * 3] = (palette[slot * 3] ?? 0) + (analysis.centroids[index * 3] ?? 0) * count
    palette[slot * 3 + 1] = (palette[slot * 3 + 1] ?? 0) + (analysis.centroids[index * 3 + 1] ?? 0) * count
    palette[slot * 3 + 2] = (palette[slot * 3 + 2] ?? 0) + (analysis.centroids[index * 3 + 2] ?? 0) * count
  }
  for (let slot = 0; slot < groups; slot += 1) {
    const count = weight[slot] ?? 0
    if (count === 0) continue
    palette[slot * 3] = (palette[slot * 3] ?? 0) / count
    palette[slot * 3 + 1] = (palette[slot * 3 + 1] ?? 0) / count
    palette[slot * 3 + 2] = (palette[slot * 3 + 2] ?? 0) / count
  }
  return palette
}

function paintGroups(indices: Uint8Array, group: Int32Array): Int32Array {
  const map = new Int32Array(indices.length)
  for (let index = 0; index < indices.length; index += 1) map[index] = group[indices[index] ?? 0] ?? 0
  return map
}

function distinctCount(map: Int32Array, groups: number): number {
  const seen = new Uint8Array(groups)
  let count = 0
  for (let index = 0; index < map.length; index += 1) {
    const value = map[index] ?? 0
    if (value < 0 || value >= groups || seen[value]) continue
    seen[value] = 1
    count += 1
  }
  return count
}

function mergeDown(map: Int32Array, palette: Float32Array, groups: number, target: number): Int32Array {
  const counts = new Float64Array(groups)
  for (let index = 0; index < map.length; index += 1) {
    const value = map[index] ?? 0
    if (value >= 0 && value < groups) counts[value] = (counts[value] ?? 0) + 1
  }
  const alias = new Int32Array(groups)
  for (let index = 0; index < groups; index += 1) alias[index] = index
  const find = (start: number): number => {
    let root = start
    while (alias[root] !== root) root = alias[root] ?? root
    let cursor = start
    while (alias[cursor] !== root) {
      const next = alias[cursor] ?? root
      alias[cursor] = root
      cursor = next
    }
    return root
  }

  const alive: number[] = []
  for (let index = 0; index < groups; index += 1) if ((counts[index] ?? 0) > 0) alive.push(index)

  while (alive.length > target) {
    let bestLeft = 0
    let bestRight = 1
    let bestCost = Number.POSITIVE_INFINITY
    for (let left = 0; left < alive.length; left += 1) {
      for (let right = left + 1; right < alive.length; right += 1) {
        const a = alive[left] ?? 0
        const b = alive[right] ?? 0
        const dL = (palette[a * 3] ?? 0) - (palette[b * 3] ?? 0)
        const dA = (palette[a * 3 + 1] ?? 0) - (palette[b * 3 + 1] ?? 0)
        const dB = (palette[a * 3 + 2] ?? 0) - (palette[b * 3 + 2] ?? 0)
        const leftCount = counts[a] ?? 0
        const rightCount = counts[b] ?? 0
        const cost = ((leftCount * rightCount) / (leftCount + rightCount)) * (dL * dL + dA * dA + dB * dB)
        if (cost < bestCost) {
          bestCost = cost
          bestLeft = left
          bestRight = right
        }
      }
    }
    const leftId = alive[bestLeft] ?? 0
    const rightId = alive[bestRight] ?? 0
    const leftCount = counts[leftId] ?? 0
    const rightCount = counts[rightId] ?? 0
    const total = leftCount + rightCount
    const keep = leftCount >= rightCount ? leftId : rightId
    const drop = keep === leftId ? rightId : leftId
    if (total > 0) {
      for (let channel = 0; channel < 3; channel += 1) {
        palette[keep * 3 + channel] =
          ((palette[keep * 3 + channel] ?? 0) * (counts[keep] ?? 0) + (palette[drop * 3 + channel] ?? 0) * (counts[drop] ?? 0)) / total
      }
    }
    counts[keep] = total
    counts[drop] = 0
    alias[drop] = keep
    alive.splice(keep === leftId ? bestRight : bestLeft, 1)
  }

  const out = new Int32Array(map.length)
  for (let index = 0; index < map.length; index += 1) out[index] = find(map[index] ?? 0)
  return out
}

function finalize(map: Int32Array, palette: Float32Array, groups: number, width: number, height: number, requested: number): Reduction {
  const counts = new Uint32Array(groups)
  for (let index = 0; index < map.length; index += 1) {
    const value = map[index] ?? 0
    if (value >= 0 && value < groups) counts[value] = (counts[value] ?? 0) + 1
  }
  const present: number[] = []
  for (let index = 0; index < groups; index += 1) if ((counts[index] ?? 0) > 0) present.push(index)
  present.sort((left, right) => (palette[left * 3] ?? 0) - (palette[right * 3] ?? 0) || left - right)

  const colors: PaletteColor[] = present.map((id) => ({
    L: palette[id * 3] ?? 0,
    a: palette[id * 3 + 1] ?? 0,
    b: palette[id * 3 + 2] ?? 0,
    hex: oklabToHex(palette[id * 3] ?? 0, palette[id * 3 + 1] ?? 0, palette[id * 3 + 2] ?? 0),
    pixelCount: counts[id] ?? 0,
  }))
  ensureDistinctHexes(colors)

  const order = new Int32Array(groups)
  for (let slot = 0; slot < present.length; slot += 1) order[present[slot] ?? 0] = slot

  const labelMap = new Uint8Array(map.length)
  for (let index = 0; index < map.length; index += 1) labelMap[index] = order[map[index] ?? 0] ?? 0

  return {
    labelMap,
    palette: colors,
    limitedBy: colors.length < requested ? 'image' : null,
    width,
    height,
  }
}

export function reduce(analysis: Analysis, options: ReduceOptions, timings?: ReduceTimings): Reduction {
  const settings = DETAIL_LEVELS[options.detail]
  const { minArea, minRadius } = reductionLimits(options.detail, options.pxPerMm)
  const wardStarted = timings ? performance.now() : 0
  const merges = wardMerges(analysis)
  if (timings) timings.ward += performance.now() - wardStarted
  const target = Math.min(Math.max(1, options.colorCount), analysis.k)
  const groups = analysis.k
  const cutStarted = timings ? performance.now() : 0
  const group = cutAt(analysis.k, merges, groups)
  const palette = groupPalette(analysis, group, groups)
  let map = paintGroups(analysis.indices, group)
  if (timings) timings.ward += performance.now() - cutStarted
  const modeStarted = timings ? performance.now() : 0
  if (settings.modePasses > 0) map = modeFilter(map, analysis.width, analysis.height, groups, settings.modePasses)
  if (timings) timings.mode += performance.now() - modeStarted
  const used = distinctCount(map, groups)
  if (used > target) {
    const finishStarted = timings ? performance.now() : 0
    map = mergeDown(map, palette, groups, target)
    if (timings) timings.finisher += performance.now() - finishStarted
  }
  const cleanupStarted = timings ? performance.now() : 0
  map = cleanupRegions(map, analysis.width, analysis.height, palette, minArea, minRadius, true)
  if (timings) timings.cleanup += performance.now() - cleanupStarted

  return finalize(map, palette, groups, analysis.width, analysis.height, options.colorCount)
}
