const DIAGONAL = 1.41421356

export type Components = {
  comp: Int32Array
  color: Int32Array
  size: Int32Array
}

export function connectedComponents(labels: ArrayLike<number>, width: number, height: number): Components {
  const pixels = width * height
  const comp = new Int32Array(pixels).fill(-1)
  const colors = new Int32Array(Math.max(1, pixels))
  const sizes = new Int32Array(Math.max(1, pixels))
  const stack = new Int32Array(pixels)
  let componentCount = 0

  for (let start = 0; start < pixels; start += 1) {
    if (comp[start] !== -1) continue
    const id = componentCount
    const color = labels[start] ?? 0
    let size = 0
    let pointer = 0
    stack[pointer] = start
    pointer += 1
    comp[start] = id
    while (pointer > 0) {
      pointer -= 1
      const index = stack[pointer] ?? 0
      size += 1
      const x = index % width
      if (x > 0 && comp[index - 1] === -1 && (labels[index - 1] ?? 0) === color) {
        comp[index - 1] = id
        stack[pointer] = index - 1
        pointer += 1
      }
      if (x < width - 1 && comp[index + 1] === -1 && (labels[index + 1] ?? 0) === color) {
        comp[index + 1] = id
        stack[pointer] = index + 1
        pointer += 1
      }
      if (index >= width && comp[index - width] === -1 && (labels[index - width] ?? 0) === color) {
        comp[index - width] = id
        stack[pointer] = index - width
        pointer += 1
      }
      if (index < pixels - width && comp[index + width] === -1 && (labels[index + width] ?? 0) === color) {
        comp[index + width] = id
        stack[pointer] = index + width
        pointer += 1
      }
    }
    colors[id] = color
    sizes[id] = size
    componentCount += 1
  }

  return { comp, color: colors.subarray(0, componentCount), size: sizes.subarray(0, componentCount) }
}

export function regionSizeReport(
  labels: ArrayLike<number>,
  width: number,
  height: number,
  minArea: number,
  labelMinPx = 0,
): { regions: number; undersized: number; sole: number; labelsBelowMin: number; nonSoleLabelsBelowMin: number } {
  const { comp, color, size } = connectedComponents(labels, width, height)
  let maxColor = 0
  for (let id = 0; id < color.length; id += 1) maxColor = Math.max(maxColor, color[id] ?? 0)
  const counts = new Int32Array(maxColor + 1)
  for (let id = 0; id < color.length; id += 1) {
    const value = color[id] ?? 0
    counts[value] = (counts[value] ?? 0) + 1
  }
  let undersized = 0
  let sole = 0
  for (let id = 0; id < color.length; id += 1) {
    if ((size[id] ?? 0) >= minArea) continue
    const value = color[id] ?? 0
    if ((counts[value] ?? 0) <= 1) sole += 1
    else undersized += 1
  }
  let labelsBelowMin = 0
  let nonSoleLabelsBelowMin = 0
  if (labelMinPx > 0 && color.length > 0) {
    const { radius } = chamferMax(comp, color.length, width, height)
    for (let id = 0; id < color.length; id += 1) {
      const digits = String((color[id] ?? 0) + 1).length
      const fitPx = (2 * (radius[id] ?? 1)) / Math.hypot(0.56 * digits, 0.75)
      if (fitPx < labelMinPx) {
        labelsBelowMin += 1
        if ((counts[color[id] ?? 0] ?? 0) > 1) nonSoleLabelsBelowMin += 1
      }
    }
  }
  return { regions: color.length, undersized, sole, labelsBelowMin, nonSoleLabelsBelowMin }
}

export function chamferMax(comp: Int32Array, componentCount: number, width: number, height: number): { radius: Float32Array; at: Int32Array } {
  const pixels = width * height
  const distance = new Float32Array(pixels)
  const infinite = 1e9
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const id = comp[index] ?? 0
      const boundary =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        (comp[index - 1] ?? -1) !== id ||
        (comp[index + 1] ?? -1) !== id ||
        (y > 0 && (comp[index - width] ?? -1) !== id) ||
        (y < height - 1 && (comp[index + width] ?? -1) !== id)
      distance[index] = boundary ? 1 : infinite
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const id = comp[index] ?? 0
      let value = distance[index] ?? infinite
      if (x > 0 && comp[index - 1] === id) value = Math.min(value, (distance[index - 1] ?? infinite) + 1)
      if (y > 0 && comp[index - width] === id) {
        value = Math.min(value, (distance[index - width] ?? infinite) + 1)
        if (x > 0 && comp[index - width - 1] === id) value = Math.min(value, (distance[index - width - 1] ?? infinite) + DIAGONAL)
        if (x < width - 1 && comp[index - width + 1] === id) value = Math.min(value, (distance[index - width + 1] ?? infinite) + DIAGONAL)
      }
      distance[index] = value
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x
      const id = comp[index] ?? 0
      let value = distance[index] ?? infinite
      if (x < width - 1 && comp[index + 1] === id) value = Math.min(value, (distance[index + 1] ?? infinite) + 1)
      if (y < height - 1 && comp[index + width] === id) {
        value = Math.min(value, (distance[index + width] ?? infinite) + 1)
        if (x < width - 1 && comp[index + width + 1] === id) value = Math.min(value, (distance[index + width + 1] ?? infinite) + DIAGONAL)
        if (x > 0 && comp[index + width - 1] === id) value = Math.min(value, (distance[index + width - 1] ?? infinite) + DIAGONAL)
      }
      distance[index] = value
    }
  }

  const radius = new Float32Array(componentCount)
  const at = new Int32Array(componentCount)
  for (let index = 0; index < pixels; index += 1) {
    const id = comp[index] ?? 0
    const value = distance[index] ?? 0
    if (value > (radius[id] ?? 0)) {
      radius[id] = value
      at[id] = index
    }
  }
  return { radius, at }
}

type Adjacency = {
  offsets: Uint32Array
  neighbors: Int32Array
  weights: Uint32Array
}

function buildAdjacency(comp: Int32Array, width: number, height: number, componentCount: number): Adjacency {
  const pixels = width * height
  let raw = 0
  for (let index = 0; index < pixels; index += 1) {
    const left = comp[index] ?? 0
    const x = index % width
    if (x < width - 1 && (comp[index + 1] ?? 0) !== left) raw += 1
    if (index < pixels - width && (comp[index + width] ?? 0) !== left) raw += 1
  }
  const pairA = new Int32Array(raw)
  const pairB = new Int32Array(raw)
  let cursor = 0
  for (let index = 0; index < pixels; index += 1) {
    const left = comp[index] ?? 0
    const x = index % width
    if (x < width - 1) {
      const right = comp[index + 1] ?? 0
      if (left !== right) cursor = pushPair(pairA, pairB, cursor, left, right)
    }
    if (index < pixels - width) {
      const down = comp[index + width] ?? 0
      if (left !== down) cursor = pushPair(pairA, pairB, cursor, left, down)
    }
  }

  const bucket = new Uint32Array(componentCount)
  for (let index = 0; index < raw; index += 1) bucket[pairA[index] ?? 0] = (bucket[pairA[index] ?? 0] ?? 0) + 1
  const grouped = new Uint32Array(componentCount + 1)
  for (let id = 0; id < componentCount; id += 1) grouped[id + 1] = (grouped[id] ?? 0) + (bucket[id] ?? 0)
  const ordered = new Int32Array(raw)
  const fillGroup = new Uint32Array(grouped)
  for (let index = 0; index < raw; index += 1) {
    const left = pairA[index] ?? 0
    const slot = fillGroup[left] ?? 0
    ordered[slot] = pairB[index] ?? 0
    fillGroup[left] = slot + 1
  }

  const stamp = new Int32Array(componentCount)
  const scratchWeight = new Uint32Array(componentCount)
  const degree = new Uint32Array(componentCount)
  const seen: number[] = []
  let epoch = 1
  for (let id = 0; id < componentCount; id += 1) {
    const begin = grouped[id] ?? 0
    const end = grouped[id + 1] ?? begin
    if (begin === end) continue
    epoch += 1
    seen.length = 0
    for (let index = begin; index < end; index += 1) {
      const right = ordered[index] ?? 0
      if (stamp[right] !== epoch) {
        stamp[right] = epoch
        scratchWeight[right] = 1
        seen.push(right)
      } else {
        scratchWeight[right] = (scratchWeight[right] ?? 0) + 1
      }
    }
    degree[id] = (degree[id] ?? 0) + seen.length
    for (let index = 0; index < seen.length; index += 1) {
      const right = seen[index] ?? 0
      degree[right] = (degree[right] ?? 0) + 1
    }
  }

  const offsets = new Uint32Array(componentCount + 1)
  for (let id = 0; id < componentCount; id += 1) offsets[id + 1] = (offsets[id] ?? 0) + (degree[id] ?? 0)
  const neighbors = new Int32Array(offsets[componentCount] ?? 0)
  const weights = new Uint32Array(offsets[componentCount] ?? 0)
  const fill = new Uint32Array(offsets)
  epoch = 1
  stamp.fill(0)
  for (let id = 0; id < componentCount; id += 1) {
    const begin = grouped[id] ?? 0
    const end = grouped[id + 1] ?? begin
    if (begin === end) continue
    epoch += 1
    seen.length = 0
    for (let index = begin; index < end; index += 1) {
      const right = ordered[index] ?? 0
      if (stamp[right] !== epoch) {
        stamp[right] = epoch
        scratchWeight[right] = 1
        seen.push(right)
      } else {
        scratchWeight[right] = (scratchWeight[right] ?? 0) + 1
      }
    }
    for (let index = 0; index < seen.length; index += 1) {
      const right = seen[index] ?? 0
      const weight = scratchWeight[right] ?? 0
      const leftSlot = fill[id] ?? 0
      neighbors[leftSlot] = right
      weights[leftSlot] = weight
      fill[id] = leftSlot + 1
      const rightSlot = fill[right] ?? 0
      neighbors[rightSlot] = id
      weights[rightSlot] = weight
      fill[right] = rightSlot + 1
    }
  }
  return { offsets, neighbors, weights }
}

function pushPair(pairA: Int32Array, pairB: Int32Array, index: number, left: number, right: number): number {
  if (left < right) {
    pairA[index] = left
    pairB[index] = right
  } else {
    pairA[index] = right
    pairB[index] = left
  }
  return index + 1
}

function hasUnprotectedThinRegion(
  labels: Int32Array,
  width: number,
  height: number,
  minRadius: number,
  protect: boolean,
): boolean {
  const { comp, color } = connectedComponents(labels, width, height)
  const componentCount = color.length
  if (componentCount === 0) return false
  const { radius } = chamferMax(comp, componentCount, width, height)
  let maxColor = 0
  for (let id = 0; id < componentCount; id += 1) maxColor = Math.max(maxColor, color[id] ?? 0)
  const regionsOfColor = new Int32Array(maxColor + 1)
  for (let id = 0; id < componentCount; id += 1) {
    const value = color[id] ?? 0
    regionsOfColor[value] = (regionsOfColor[value] ?? 0) + 1
  }
  for (let id = 0; id < componentCount; id += 1) {
    if ((radius[id] ?? 0) >= minRadius) continue
    const value = color[id] ?? 0
    if (protect && (regionsOfColor[value] ?? 0) <= 1) continue
    return true
  }
  return false
}

function dissolveRegions(
  labels: Int32Array,
  width: number,
  height: number,
  palette: Float32Array,
  minArea: number,
  minRadius: number,
  protect: boolean,
): Int32Array {
  const { comp, color, size } = connectedComponents(labels, width, height)
  const componentCount = color.length
  if (componentCount === 0) return labels

  const area = new Int32Array(size)
  const thin = new Uint8Array(componentCount)
  if (minRadius > 0) {
    const { radius } = chamferMax(comp, componentCount, width, height)
    for (let id = 0; id < componentCount; id += 1) {
      if ((radius[id] ?? 0) < minRadius) thin[id] = 1
    }
  }

  const { offsets, neighbors, weights } = buildAdjacency(comp, width, height, componentCount)
  const parent = new Int32Array(componentCount)
  for (let id = 0; id < componentCount; id += 1) parent[id] = id
  const find = (startId: number): number => {
    let root = startId
    while (parent[root] !== root) root = parent[root] ?? root
    let cursor = startId
    while (parent[cursor] !== root) {
      const next = parent[cursor] ?? root
      parent[cursor] = root
      cursor = next
    }
    return root
  }

  const colors = new Int32Array(color)
  const sizes = new Int32Array(area)
  let maxColor = 0
  for (let id = 0; id < componentCount; id += 1) maxColor = Math.max(maxColor, color[id] ?? 0)
  const regionsOfColor = new Int32Array(maxColor + 1)
  for (let id = 0; id < componentCount; id += 1) {
    const value = color[id] ?? 0
    regionsOfColor[value] = (regionsOfColor[value] ?? 0) + 1
  }

  const extra: Array<Map<number, number> | undefined> = new Array(componentCount)
  const scratch = new Map<number, number>()
  const loadBorders = (id: number) => {
    scratch.clear()
    const bag = extra[id]
    if (bag) {
      for (const [neighbor, weight] of bag) {
        const root = find(neighbor)
        if (root === id) continue
        scratch.set(root, (scratch.get(root) ?? 0) + weight)
      }
      return
    }
    const begin = offsets[id] ?? 0
    const end = offsets[id + 1] ?? begin
    for (let edge = begin; edge < end; edge += 1) {
      const root = find(neighbors[edge] ?? 0)
      if (root === id) continue
      scratch.set(root, (scratch.get(root) ?? 0) + (weights[edge] ?? 0))
    }
  }
  const linkCount = (id: number) => (offsets[id + 1] ?? 0) - (offsets[id] ?? 0) + (extra[id]?.size ?? 0)

  const needsMerge = (id: number) => (sizes[id] ?? 0) < minArea || (thin[id] ?? 0) === 1
  const queue: number[] = []
  for (let id = 0; id < componentCount; id += 1) {
    if (needsMerge(id)) queue.push(id)
  }
  queue.sort((left, right) => (sizes[left] ?? 0) - (sizes[right] ?? 0) || left - right)

  for (let index = 0; index < queue.length; index += 1) {
    const startId = queue[index] ?? 0
    if (find(startId) !== startId) continue
    if (!needsMerge(startId)) continue
    const sourceColor = colors[startId] ?? 0
    if (protect && (regionsOfColor[sourceColor] ?? 0) <= 1) continue

    loadBorders(startId)
    let best = -1
    let bestScore = Number.POSITIVE_INFINITY
    for (const [root, length] of scratch) {
      if (length <= 0) continue
      const targetColor = colors[root] ?? 0
      const dL = (palette[sourceColor * 3] ?? 0) - (palette[targetColor * 3] ?? 0)
      const dA = (palette[sourceColor * 3 + 1] ?? 0) - (palette[targetColor * 3 + 1] ?? 0)
      const dB = (palette[sourceColor * 3 + 2] ?? 0) - (palette[targetColor * 3 + 2] ?? 0)
      const score = Math.sqrt(dL * dL + dA * dA + dB * dB) / Math.sqrt(length)
      if (score < bestScore || (score === bestScore && root < best)) {
        bestScore = score
        best = root
      }
    }
    if (best < 0) continue

    regionsOfColor[sourceColor] = (regionsOfColor[sourceColor] ?? 1) - 1
    let into = best
    let from = startId
    const adopted = colors[best] ?? 0
    const absorbed = new Map(scratch)
    if (linkCount(from) > linkCount(into)) {
      into = startId
      from = best
      loadBorders(from)
      absorbed.clear()
      for (const [neighbor, weight] of scratch) absorbed.set(neighbor, weight)
    }
    parent[from] = into
    sizes[into] = (sizes[from] ?? 0) + (sizes[into] ?? 0)
    thin[into] = (thin[from] ?? 0) === 1 && (thin[into] ?? 0) === 1 ? 1 : 0
    colors[into] = adopted
    if (needsMerge(into)) {
      loadBorders(into)
      const merged = new Map<number, number>()
      for (const [neighbor, weight] of scratch) {
        if (neighbor === from) continue
        merged.set(neighbor, weight)
      }
      for (const [neighbor, weight] of absorbed) {
        if (neighbor === into) continue
        merged.set(neighbor, (merged.get(neighbor) ?? 0) + weight)
      }
      extra[into] = merged
      queue.push(into)
    }
    extra[from] = undefined
  }

  const out = new Int32Array(labels.length)
  for (let index = 0; index < labels.length; index += 1) out[index] = colors[find(comp[index] ?? 0)] ?? 0
  return out
}

export function cleanupRegions(
  labels: Int32Array,
  width: number,
  height: number,
  palette: Float32Array,
  minArea: number,
  minRadius: number,
  protect: boolean,
): Int32Array {
  const once = dissolveRegions(labels, width, height, palette, minArea, minRadius, protect)
  if (minRadius <= 0 || !hasUnprotectedThinRegion(once, width, height, minRadius, protect)) return once
  return dissolveRegions(once, width, height, palette, minArea, minRadius, protect)
}

function tally(value: number, counts: Int32Array, touched: Int32Array, touchedCount: number): number {
  if ((counts[value] ?? 0) === 0) {
    touched[touchedCount] = value
    touchedCount += 1
  }
  counts[value] = (counts[value] ?? 0) + 1
  return touchedCount
}

function modeAt(source: Int32Array, index: number, width: number, counts: Int32Array, touched: Int32Array): number {
  const self = source[index] ?? 0
  const up = index - width
  const down = index + width
  let touchedCount = tally(source[up - 1] ?? 0, counts, touched, 0)
  touchedCount = tally(source[up] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(source[up + 1] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(source[index - 1] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(self, counts, touched, touchedCount)
  touchedCount = tally(source[index + 1] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(source[down - 1] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(source[down] ?? 0, counts, touched, touchedCount)
  touchedCount = tally(source[down + 1] ?? 0, counts, touched, touchedCount)
  let best = self
  let bestCount = counts[self] ?? 0
  for (let slot = 0; slot < touchedCount; slot += 1) {
    const value = touched[slot] ?? 0
    const count = counts[value] ?? 0
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  }
  for (let slot = 0; slot < touchedCount; slot += 1) counts[touched[slot] ?? 0] = 0
  return best
}

export function modeFilter(map: Int32Array, width: number, height: number, labelCount: number, passes: number): Int32Array {
  let source = map
  const counts = new Int32Array(Math.max(1, labelCount))
  const touched = new Int32Array(9)
  for (let pass = 0; pass < passes; pass += 1) {
    const destination = new Int32Array(source.length)
    if (width >= 3 && height >= 3) {
      for (let y = 1; y < height - 1; y += 1) {
        const row = y * width
        for (let x = 1; x < width - 1; x += 1) {
          const index = row + x
          const self = source[index] ?? 0
          const up = index - width
          const down = index + width
          if (
            source[up - 1] === self &&
            source[up] === self &&
            source[up + 1] === self &&
            source[index - 1] === self &&
            source[index + 1] === self &&
            source[down - 1] === self &&
            source[down] === self &&
            source[down + 1] === self
          ) {
            destination[index] = self
            continue
          }
          destination[index] = modeAt(source, index, width, counts, touched)
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      destination[x] = edgeMode(source, 0, x, width, height, counts, touched)
      if (height > 1) destination[(height - 1) * width + x] = edgeMode(source, height - 1, x, width, height, counts, touched)
    }
    for (let y = 1; y < height - 1; y += 1) {
      destination[y * width] = edgeMode(source, y, 0, width, height, counts, touched)
      destination[y * width + width - 1] = edgeMode(source, y, width - 1, width, height, counts, touched)
    }
    source = destination
  }
  return source
}

function edgeMode(
  source: Int32Array,
  y: number,
  x: number,
  width: number,
  height: number,
  counts: Int32Array,
  touched: Int32Array,
): number {
  const self = source[y * width + x] ?? 0
  let touchedCount = 0
  const y0 = y > 0 ? y - 1 : y
  const y1 = y < height - 1 ? y + 1 : y
  const x0 = x > 0 ? x - 1 : x
  const x1 = x < width - 1 ? x + 1 : x
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const value = source[yy * width + xx] ?? 0
      if ((counts[value] ?? 0) === 0) {
        touched[touchedCount] = value
        touchedCount += 1
      }
      counts[value] = (counts[value] ?? 0) + 1
    }
  }
  let best = self
  let bestCount = counts[self] ?? 0
  for (let index = 0; index < touchedCount; index += 1) {
    const value = touched[index] ?? 0
    const count = counts[value] ?? 0
    if (count > bestCount) {
      bestCount = count
      best = value
    }
  }
  for (let index = 0; index < touchedCount; index += 1) counts[touched[index] ?? 0] = 0
  return best
}
