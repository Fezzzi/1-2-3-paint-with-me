import { RDP_EPSILON, SMOOTH_SIGMA } from './params.ts'
import type { VectorChains } from './types.ts'

export type RawChain = {
  points: number[]
  closed: boolean
}

function stepFrom(
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: Uint8Array,
  vertical: Uint8Array,
): [number, number] | null {
  const stride = width + 1
  if (x < width && horizontal[y * width + x]) {
    horizontal[y * width + x] = 0
    return [x + 1, y]
  }
  if (x > 0 && horizontal[y * width + x - 1]) {
    horizontal[y * width + x - 1] = 0
    return [x - 1, y]
  }
  if (y < height && vertical[y * stride + x]) {
    vertical[y * stride + x] = 0
    return [x, y + 1]
  }
  if (y > 0 && vertical[(y - 1) * stride + x]) {
    vertical[(y - 1) * stride + x] = 0
    return [x, y - 1]
  }
  return null
}

export function traceBoundaries(labels: ArrayLike<number>, width: number, height: number): RawChain[] {
  const horizontal = new Uint8Array(width * (height + 1))
  const vertical = new Uint8Array((width + 1) * height)
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((labels[y * width + x] ?? 0) !== (labels[(y - 1) * width + x] ?? 0)) horizontal[y * width + x] = 1
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      if ((labels[y * width + x] ?? 0) !== (labels[y * width + x - 1] ?? 0)) vertical[y * (width + 1) + x] = 1
    }
  }

  const stride = width + 1
  const degree = new Uint8Array(stride * (height + 1))
  for (let y = 0; y <= height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!horizontal[y * width + x]) continue
      degree[y * stride + x] = (degree[y * stride + x] ?? 0) + 1
      degree[y * stride + x + 1] = (degree[y * stride + x + 1] ?? 0) + 1
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      if (!vertical[y * stride + x]) continue
      degree[y * stride + x] = (degree[y * stride + x] ?? 0) + 1
      degree[(y + 1) * stride + x] = (degree[(y + 1) * stride + x] ?? 0) + 1
    }
  }

  const walk = (sx: number, sy: number, stopAtStart: boolean): number[] => {
    const points = [sx, sy]
    let x = sx
    let y = sy
    for (;;) {
      const next = stepFrom(x, y, width, height, horizontal, vertical)
      if (!next) break
      x = next[0]
      y = next[1]
      points.push(x, y)
      if ((degree[y * stride + x] ?? 0) !== 2) break
      if (stopAtStart && x === sx && y === sy) break
    }
    return points
  }

  const chains: RawChain[] = []
  for (let y = 0; y <= height; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      const vertex = degree[y * stride + x] ?? 0
      if (vertex === 0 || vertex === 2) continue
      for (let edge = 0; edge < vertex; edge += 1) {
        const points = walk(x, y, false)
        if (points.length > 2) chains.push({ points, closed: false })
      }
    }
  }
  for (let y = 0; y <= height; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      if ((degree[y * stride + x] ?? 0) !== 2) continue
      for (;;) {
        const points = walk(x, y, true)
        if (points.length <= 2) break
        const closed = points[0] === points[points.length - 2] && points[1] === points[points.length - 1]
        chains.push({ points, closed })
      }
    }
  }
  return chains
}

function smoothChain(points: number[], sigma: number, closed: boolean): number[] {
  const count = points.length / 2
  if (count < 3) return points.slice()
  const radius = Math.ceil(sigma * 2)
  const kernel: number[] = []
  for (let offset = -radius; offset <= radius; offset += 1) kernel.push(Math.exp(-(offset * offset) / (2 * sigma * sigma)))
  const out = points.slice()
  const unique = closed ? count - 1 : count
  for (let index = 0; index < unique; index += 1) {
    if (!closed && (index === 0 || index === count - 1)) continue
    let sumX = 0
    let sumY = 0
    let sumWeight = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      let sample = index + offset
      if (closed) sample = ((sample % unique) + unique) % unique
      else if (sample < 0 || sample > count - 1) continue
      const weight = kernel[offset + radius] ?? 0
      sumX += (points[sample * 2] ?? 0) * weight
      sumY += (points[sample * 2 + 1] ?? 0) * weight
      sumWeight += weight
    }
    const smoothX = sumWeight > 0 ? sumX / sumWeight : (points[index * 2] ?? 0)
    const smoothY = sumWeight > 0 ? sumY / sumWeight : (points[index * 2 + 1] ?? 0)
    if (!closed) {
      const edge = Math.min(index, count - 1 - index)
      const blend = Math.min(1, edge / radius)
      out[index * 2] = (points[index * 2] ?? 0) * (1 - blend) + smoothX * blend
      out[index * 2 + 1] = (points[index * 2 + 1] ?? 0) * (1 - blend) + smoothY * blend
    } else {
      out[index * 2] = smoothX
      out[index * 2 + 1] = smoothY
    }
  }
  if (closed) {
    out[out.length - 2] = out[0] ?? 0
    out[out.length - 1] = out[1] ?? 0
  }
  return out
}

function rdpOpen(points: number[], epsilon: number): number[] {
  const count = points.length / 2
  if (count <= 2) return points.slice()
  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: Array<[number, number]> = [[0, count - 1]]
  while (stack.length > 0) {
    const range = stack.pop()
    if (!range) break
    const [start, end] = range
    const ax = points[start * 2] ?? 0
    const ay = points[start * 2 + 1] ?? 0
    const bx = points[end * 2] ?? 0
    const by = points[end * 2 + 1] ?? 0
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy)
    let maxDistance = -1
    let maxIndex = -1
    for (let index = start + 1; index < end; index += 1) {
      const px = points[index * 2] ?? 0
      const py = points[index * 2 + 1] ?? 0
      const distance = length < 1e-6 ? Math.hypot(px - ax, py - ay) : Math.abs((px - ax) * dy - (py - ay) * dx) / length
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = index
      }
    }
    if (maxDistance > epsilon && maxIndex >= 0) {
      keep[maxIndex] = 1
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }
  const out: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (!keep[index]) continue
    out.push(points[index * 2] ?? 0, points[index * 2 + 1] ?? 0)
  }
  return out
}

function rdpClosed(points: number[], epsilon: number): number[] {
  const count = points.length / 2
  if (count <= 4) return points.slice()
  const unique = count - 1
  let far = 1
  let farDistance = -1
  const x0 = points[0] ?? 0
  const y0 = points[1] ?? 0
  for (let index = 1; index < unique; index += 1) {
    const distance = Math.hypot((points[index * 2] ?? 0) - x0, (points[index * 2 + 1] ?? 0) - y0)
    if (distance > farDistance) {
      farDistance = distance
      far = index
    }
  }
  const first = rdpOpen(points.slice(0, (far + 1) * 2), epsilon)
  const second = rdpOpen(points.slice(far * 2, unique * 2).concat([x0, y0]), epsilon)
  const out = first.slice(0, -2).concat(second)
  if (out[0] !== out[out.length - 2] || out[1] !== out[out.length - 1]) out.push(x0, y0)
  return out
}

function pack(chains: number[][]): VectorChains {
  let total = 0
  for (const chain of chains) total += chain.length / 2
  const points = new Float32Array(total * 2)
  const offsets = new Uint32Array(chains.length + 1)
  let cursor = 0
  for (let index = 0; index < chains.length; index += 1) {
    offsets[index] = cursor
    const chain = chains[index] ?? []
    for (let point = 0; point < chain.length; point += 2) {
      points[cursor * 2] = chain[point] ?? 0
      points[cursor * 2 + 1] = chain[point + 1] ?? 0
      cursor += 1
    }
  }
  offsets[chains.length] = cursor
  return { points, offsets }
}

export function vectorize(labels: ArrayLike<number>, width: number, height: number): VectorChains {
  const simplified = traceBoundaries(labels, width, height).map((chain) => {
    const smooth = smoothChain(chain.points, SMOOTH_SIGMA, chain.closed)
    return chain.closed ? rdpClosed(smooth, RDP_EPSILON) : rdpOpen(smooth, RDP_EPSILON)
  })
  return pack(simplified.filter((chain) => chain.length >= 4))
}

export function toSvgPathData(chains: VectorChains, scale = 1): string {
  const { points, offsets } = chains
  let path = ''
  for (let chain = 0; chain < offsets.length - 1; chain += 1) {
    const start = offsets[chain] ?? 0
    const end = offsets[chain + 1] ?? start
    if (end - start < 2) continue
    path += `M${formatPoint(points[start * 2] ?? 0, scale)} ${formatPoint(points[start * 2 + 1] ?? 0, scale)}`
    for (let index = start + 1; index < end; index += 1) {
      path += `L${formatPoint(points[index * 2] ?? 0, scale)} ${formatPoint(points[index * 2 + 1] ?? 0, scale)}`
    }
  }
  return path
}

function formatPoint(value: number, scale: number): string {
  const scaled = value * scale
  const rounded = Math.round(scaled * 100) / 100
  return String(rounded)
}
