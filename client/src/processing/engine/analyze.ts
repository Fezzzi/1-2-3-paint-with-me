import { ANALYSIS_COLOR_COUNT, ENGINE_VERSION } from '../defaults.ts'
import { flattenRgba, rgbToOklab } from './color.ts'
import {
  BILATERAL_PASSES,
  BILATERAL_RADIUS,
  BILATERAL_SIGMA_COLOR,
  BILATERAL_SIGMA_SPACE,
  COLOR_LUT_BINS,
  KMEANS_MAX_ITERATIONS,
  KMEANS_SHIFT,
  PRNG_SEED,
} from './params.ts'
import { mulberry32 } from './random.ts'
import type { Analysis } from './types.ts'

const LAB_LEVELS = 32
const LAB_BINS = LAB_LEVELS * LAB_LEVELS * LAB_LEVELS
const AB_MIN = -0.4
const AB_SPAN = 0.8

export type AnalyzeTimings = {
  convert: number
  bilateral: number
  histogram: number
  kmeans: number
  assign: number
}

function buildColorLut(sigmaColor: number): { lut: Float32Array; maxD2: number; scale: number } {
  const maxD2 = 9 * sigmaColor * sigmaColor
  const lut = new Float32Array(COLOR_LUT_BINS)
  const denom = 2 * sigmaColor * sigmaColor
  for (let index = 0; index < COLOR_LUT_BINS; index += 1) {
    const distance = (index / (COLOR_LUT_BINS - 1)) * maxD2
    lut[index] = Math.exp(-distance / denom)
  }
  return { lut, maxD2, scale: (COLOR_LUT_BINS - 1) / maxD2 }
}

function buildSpatialKernel(radius: number, sigmaSpace: number): Float32Array {
  const size = radius * 2 + 1
  const kernel = new Float32Array(size * size)
  const denom = 2 * sigmaSpace * sigmaSpace
  let index = 0
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      kernel[index] = Math.exp(-(dx * dx + dy * dy) / denom)
      index += 1
    }
  }
  return kernel
}

function bilateralPass(
  lab: Float32Array,
  width: number,
  height: number,
  onRow?: (row: number) => void,
): Float32Array {
  const radius = BILATERAL_RADIUS
  const spatial = buildSpatialKernel(radius, BILATERAL_SIGMA_SPACE)
  const { lut, maxD2, scale } = buildColorLut(BILATERAL_SIGMA_COLOR)
  const out = new Float32Array(lab.length)
  const tail = lut[COLOR_LUT_BINS - 1] ?? 0
  const lastX = width - radius
  const lastY = height - radius
  const size = radius * 2 + 1

  for (let y = radius; y < lastY; y += 1) {
    for (let x = radius; x < lastX; x += 1) {
      const center = (y * width + x) * 3
      const L0 = lab[center] as number
      const A0 = lab[center + 1] as number
      const B0 = lab[center + 2] as number
      let weightSum = 0
      let sumL = 0
      let sumA = 0
      let sumB = 0
      let kernelIndex = 0
      for (let dy = 0; dy < size; dy += 1) {
        const row = (y + dy - radius) * width
        for (let dx = 0; dx < size; dx += 1) {
          const sample = (row + x + dx - radius) * 3
          const sampleL = lab[sample] as number
          const sampleA = lab[sample + 1] as number
          const sampleB = lab[sample + 2] as number
          const dL = sampleL - L0
          const dA = sampleA - A0
          const dB = sampleB - B0
          const distance = dL * dL + dA * dA + dB * dB
          const colorWeight = distance >= maxD2 ? tail : (lut[(distance * scale) | 0] as number)
          const weight = (spatial[kernelIndex] as number) * colorWeight
          kernelIndex += 1
          weightSum += weight
          sumL += weight * sampleL
          sumA += weight * sampleA
          sumB += weight * sampleB
        }
      }
      const safe = weightSum > 0 ? weightSum : 1
      out[center] = sumL / safe
      out[center + 1] = sumA / safe
      out[center + 2] = sumB / safe
    }
    if (onRow && y % 64 === 63) onRow(y)
  }

  const paintEdge = (x: number, y: number) => {
    accumulateClamped(lab, out, width, height, x, y, radius, spatial, lut, maxD2, scale, tail)
  }
  for (let y = 0; y < height; y += 1) {
    const interior = y >= radius && y < lastY
    const xEnd = interior ? radius : width
    for (let x = 0; x < xEnd; x += 1) paintEdge(x, y)
    if (interior) {
      for (let x = lastX; x < width; x += 1) paintEdge(x, y)
    }
  }
  return out
}

function accumulateClamped(
  lab: Float32Array,
  out: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  spatial: Float32Array,
  lut: Float32Array,
  maxD2: number,
  scale: number,
  tail: number,
): void {
  const center = (y * width + x) * 3
  const L0 = lab[center] as number
  const A0 = lab[center + 1] as number
  const B0 = lab[center + 2] as number
  let weightSum = 0
  let sumL = 0
  let sumA = 0
  let sumB = 0
  let kernelIndex = 0
  for (let dy = -radius; dy <= radius; dy += 1) {
    const sampleY = Math.min(height - 1, Math.max(0, y + dy))
    const row = sampleY * width
    for (let dx = -radius; dx <= radius; dx += 1) {
      const sampleX = Math.min(width - 1, Math.max(0, x + dx))
      const sample = (row + sampleX) * 3
      const sampleL = lab[sample] as number
      const sampleA = lab[sample + 1] as number
      const sampleB = lab[sample + 2] as number
      const dL = sampleL - L0
      const dA = sampleA - A0
      const dB = sampleB - B0
      const distance = dL * dL + dA * dA + dB * dB
      const colorWeight = distance >= maxD2 ? tail : (lut[Math.min(COLOR_LUT_BINS - 1, (distance * scale) | 0)] as number)
      const weight = (spatial[kernelIndex] as number) * colorWeight
      kernelIndex += 1
      weightSum += weight
      sumL += weight * sampleL
      sumA += weight * sampleA
      sumB += weight * sampleB
    }
  }
  const safe = weightSum > 0 ? weightSum : 1
  const centerOut = (y * width + x) * 3
  out[centerOut] = sumL / safe
  out[centerOut + 1] = sumA / safe
  out[centerOut + 2] = sumB / safe
}

function quantizeLab(L: number, A: number, B: number): number {
  let lIndex = (L * LAB_LEVELS) | 0
  if (lIndex < 0) lIndex = 0
  else if (lIndex >= LAB_LEVELS) lIndex = LAB_LEVELS - 1
  let aIndex = (((A - AB_MIN) / AB_SPAN) * LAB_LEVELS) | 0
  if (aIndex < 0) aIndex = 0
  else if (aIndex >= LAB_LEVELS) aIndex = LAB_LEVELS - 1
  let bIndex = (((B - AB_MIN) / AB_SPAN) * LAB_LEVELS) | 0
  if (bIndex < 0) bIndex = 0
  else if (bIndex >= LAB_LEVELS) bIndex = LAB_LEVELS - 1
  return (lIndex * LAB_LEVELS + aIndex) * LAB_LEVELS + bIndex
}

function distance2(samples: Float32Array, index: number, centroids: Float32Array, cluster: number): number {
  const dL = (samples[index * 3] ?? 0) - (centroids[cluster * 3] ?? 0)
  const dA = (samples[index * 3 + 1] ?? 0) - (centroids[cluster * 3 + 1] ?? 0)
  const dB = (samples[index * 3 + 2] ?? 0) - (centroids[cluster * 3 + 2] ?? 0)
  return dL * dL + dA * dA + dB * dB
}

function clusterBins(
  samples: Float32Array,
  weights: Uint32Array,
  binCount: number,
  requested: number,
): { centroids: Float32Array; assign: Uint8Array; k: number } {
  const random = mulberry32(PRNG_SEED)
  const kLimit = Math.min(requested, binCount)
  const centroids = new Float32Array(kLimit * 3)
  const nearest = new Float64Array(binCount)
  nearest.fill(Number.POSITIVE_INFINITY)

  let weightTotal = 0
  for (let index = 0; index < binCount; index += 1) weightTotal += weights[index] ?? 0
  let pick = binCount - 1
  let cursor = random() * weightTotal
  for (let index = 0; index < binCount; index += 1) {
    cursor -= weights[index] ?? 0
    if (cursor <= 0) {
      pick = index
      break
    }
  }

  const copyBin = (cluster: number, bin: number) => {
    centroids[cluster * 3] = samples[bin * 3] ?? 0
    centroids[cluster * 3 + 1] = samples[bin * 3 + 1] ?? 0
    centroids[cluster * 3 + 2] = samples[bin * 3 + 2] ?? 0
  }
  copyBin(0, pick)

  let k = 1
  while (k < kLimit) {
    let total = 0
    for (let index = 0; index < binCount; index += 1) {
      const distance = distance2(samples, index, centroids, k - 1)
      if (distance < (nearest[index] ?? 0)) nearest[index] = distance
      total += (nearest[index] ?? 0) * (weights[index] ?? 0)
    }
    if (total <= 1e-12) break
    cursor = random() * total
    pick = binCount - 1
    for (let index = 0; index < binCount; index += 1) {
      cursor -= (nearest[index] ?? 0) * (weights[index] ?? 0)
      if (cursor <= 0) {
        pick = index
        break
      }
    }
    copyBin(k, pick)
    k += 1
  }

  const assign = new Uint8Array(binCount)
  const sums = new Float64Array(k * 3)
  const counts = new Float64Array(k)
  for (let iteration = 0; iteration < KMEANS_MAX_ITERATIONS; iteration += 1) {
    sums.fill(0)
    counts.fill(0)
    for (let index = 0; index < binCount; index += 1) {
      let best = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let cluster = 0; cluster < k; cluster += 1) {
        const distance = distance2(samples, index, centroids, cluster)
        if (distance < bestDistance || (distance === bestDistance && cluster < best)) {
          bestDistance = distance
          best = cluster
        }
      }
      assign[index] = best
      const weight = weights[index] ?? 0
      counts[best] += weight
      sums[best * 3] += (samples[index * 3] ?? 0) * weight
      sums[best * 3 + 1] += (samples[index * 3 + 1] ?? 0) * weight
      sums[best * 3 + 2] += (samples[index * 3 + 2] ?? 0) * weight
    }
    let shift = 0
    for (let cluster = 0; cluster < k; cluster += 1) {
      const count = counts[cluster] ?? 0
      if (count === 0) continue
      for (let channel = 0; channel < 3; channel += 1) {
        const value = (sums[cluster * 3 + channel] ?? 0) / count
        shift = Math.max(shift, Math.abs(value - (centroids[cluster * 3 + channel] ?? 0)))
        centroids[cluster * 3 + channel] = value
      }
    }
    if (shift < KMEANS_SHIFT) break
  }

  return { centroids, assign, k }
}

export async function analyze(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  onProgress?: (progress: number) => void,
  timings?: AnalyzeTimings,
): Promise<Analysis> {
  if (width <= 0 || height <= 0) throw new Error('The photo has no pixels to analyze.')
  const pixels = width * height
  const convertStarted = timings ? performance.now() : 0
  let lab: Float32Array = new Float32Array(pixels * 3)
  for (let index = 0; index < pixels; index += 1) {
    const [r, g, b] = flattenRgba(rgba, index)
    rgbToOklab(r, g, b, lab, index * 3)
  }
  if (timings) timings.convert = performance.now() - convertStarted

  const bilateralStarted = timings ? performance.now() : 0
  for (let pass = 0; pass < BILATERAL_PASSES; pass += 1) {
    const report = onProgress
    lab = bilateralPass(
      lab,
      width,
      height,
      report
        ? (row) => {
            report(((pass + (row + 1) / height) / BILATERAL_PASSES) * 0.8)
          }
        : undefined,
    )
  }
  if (timings) timings.bilateral = performance.now() - bilateralStarted
  onProgress?.(0.82)

  const histogramStarted = timings ? performance.now() : 0
  const histogram = new Uint32Array(LAB_BINS)
  const sumL = new Float64Array(LAB_BINS)
  const sumA = new Float64Array(LAB_BINS)
  const sumB = new Float64Array(LAB_BINS)
  const bins = new Uint16Array(pixels)
  for (let index = 0; index < pixels; index += 1) {
    const L = lab[index * 3] ?? 0
    const A = lab[index * 3 + 1] ?? 0
    const B = lab[index * 3 + 2] ?? 0
    const bin = quantizeLab(L, A, B)
    bins[index] = bin
    histogram[bin] = (histogram[bin] ?? 0) + 1
    sumL[bin] = (sumL[bin] ?? 0) + L
    sumA[bin] = (sumA[bin] ?? 0) + A
    sumB[bin] = (sumB[bin] ?? 0) + B
  }

  let occupied = 0
  for (let bin = 0; bin < LAB_BINS; bin += 1) if ((histogram[bin] ?? 0) > 0) occupied += 1
  if (occupied === 0) throw new Error('The photo has no pixels to analyze.')

  const binIds = new Uint16Array(occupied)
  const weights = new Uint32Array(occupied)
  const samples = new Float32Array(occupied * 3)
  let cursor = 0
  for (let bin = 0; bin < LAB_BINS; bin += 1) {
    const count = histogram[bin] ?? 0
    if (count === 0) continue
    binIds[cursor] = bin
    weights[cursor] = count
    samples[cursor * 3] = (sumL[bin] ?? 0) / count
    samples[cursor * 3 + 1] = (sumA[bin] ?? 0) / count
    samples[cursor * 3 + 2] = (sumB[bin] ?? 0) / count
    cursor += 1
  }
  if (timings) timings.histogram = performance.now() - histogramStarted

  const kmeansStarted = timings ? performance.now() : 0
  const clustered = clusterBins(samples, weights, occupied, ANALYSIS_COLOR_COUNT)
  const lookup = new Uint8Array(LAB_BINS)
  for (let index = 0; index < occupied; index += 1) lookup[binIds[index] ?? 0] = clustered.assign[index] ?? 0
  if (timings) timings.kmeans = performance.now() - kmeansStarted

  const assignStarted = timings ? performance.now() : 0
  const sums = new Float64Array(clustered.k * 3)
  const counts = new Uint32Array(clustered.k)
  const indices = new Uint8Array(pixels)
  for (let index = 0; index < pixels; index += 1) {
    const cluster = lookup[bins[index] ?? 0] ?? 0
    indices[index] = cluster
    counts[cluster] = (counts[cluster] ?? 0) + 1
    sums[cluster * 3] += lab[index * 3] ?? 0
    sums[cluster * 3 + 1] += lab[index * 3 + 1] ?? 0
    sums[cluster * 3 + 2] += lab[index * 3 + 2] ?? 0
  }
  if (timings) timings.assign = performance.now() - assignStarted

  const remap = new Int16Array(clustered.k).fill(-1)
  let compact = 0
  for (let cluster = 0; cluster < clustered.k; cluster += 1) {
    if ((counts[cluster] ?? 0) > 0) {
      remap[cluster] = compact
      compact += 1
    }
  }
  const centroids = new Float32Array(compact * 3)
  const compactCounts = new Uint32Array(compact)
  for (let cluster = 0; cluster < clustered.k; cluster += 1) {
    const next = remap[cluster] ?? -1
    const count = counts[cluster] ?? 0
    if (next < 0 || count === 0) continue
    compactCounts[next] = count
    centroids[next * 3] = (sums[cluster * 3] ?? 0) / count
    centroids[next * 3 + 1] = (sums[cluster * 3 + 1] ?? 0) / count
    centroids[next * 3 + 2] = (sums[cluster * 3 + 2] ?? 0) / count
  }
  if (compact !== clustered.k) {
    for (let index = 0; index < pixels; index += 1) indices[index] = remap[indices[index] ?? 0] ?? 0
  }

  onProgress?.(1)
  return {
    version: ENGINE_VERSION,
    width,
    height,
    indices,
    centroids,
    counts: compactCounts,
    k: compact,
  }
}
