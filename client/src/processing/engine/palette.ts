import { colorDistance, normalizeHex, nearestPaint, type MatchablePaint } from '../match.ts'

export type AssignedPaint = {
  id: string
  hex: string
}

function usable<T extends MatchablePaint>(paints: readonly T[]): Array<T & { hex: string }> {
  const rows: Array<T & { hex: string }> = []
  for (const paint of paints) {
    const hex = normalizeHex(paint.hex)
    if (!hex) continue
    rows.push({ ...paint, hex })
  }
  return rows
}

export function usablePaintCount(paints: readonly MatchablePaint[]): number {
  return usable(paints).length
}

/**
 * Rectangular Hungarian (Kuhn–Munkres) minimizing the sum of an n×m cost matrix, n ≤ m.
 * Returns the chosen column for each row.
 */
export function hungarianAssign(cost: Float64Array, rows: number, cols: number): Int32Array {
  if (rows === 0) return new Int32Array(0)
  if (cols < rows) throw new Error('Hungarian assignment needs at least as many columns as rows')

  const matrix = new Float64Array(cost)
  const starred = new Uint8Array(rows * cols)
  const primed = new Uint8Array(rows * cols)
  const rowCover = new Uint8Array(rows)
  const colCover = new Uint8Array(cols)
  const zero = (value: number) => Math.abs(value) <= 1e-8

  for (let row = 0; row < rows; row += 1) {
    let min = Number.POSITIVE_INFINITY
    for (let col = 0; col < cols; col += 1) min = Math.min(min, matrix[row * cols + col] ?? 0)
    for (let col = 0; col < cols; col += 1) matrix[row * cols + col] = (matrix[row * cols + col] ?? 0) - min
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!zero(matrix[row * cols + col] ?? 0) || rowCover[row] || colCover[col]) continue
      starred[row * cols + col] = 1
      rowCover[row] = 1
      colCover[col] = 1
    }
  }
  rowCover.fill(0)
  colCover.fill(0)

  const starInRow = (row: number): number => {
    for (let col = 0; col < cols; col += 1) if (starred[row * cols + col]) return col
    return -1
  }
  const starInCol = (col: number): number => {
    for (let row = 0; row < rows; row += 1) if (starred[row * cols + col]) return row
    return -1
  }
  const primeInRow = (row: number): number => {
    for (let col = 0; col < cols; col += 1) if (primed[row * cols + col]) return col
    return -1
  }

  const coverStarredColumns = () => {
    colCover.fill(0)
    let covered = 0
    for (let col = 0; col < cols; col += 1) {
      if (starInCol(col) >= 0) {
        colCover[col] = 1
        covered += 1
      }
    }
    return covered
  }

  const findZero = (): [number, number] | null => {
    for (let row = 0; row < rows; row += 1) {
      if (rowCover[row]) continue
      for (let col = 0; col < cols; col += 1) {
        if (!colCover[col] && zero(matrix[row * cols + col] ?? 0)) return [row, col]
      }
    }
    return null
  }

  const adjust = () => {
    let min = Number.POSITIVE_INFINITY
    for (let row = 0; row < rows; row += 1) {
      if (rowCover[row]) continue
      for (let col = 0; col < cols; col += 1) {
        if (colCover[col]) continue
        min = Math.min(min, matrix[row * cols + col] ?? 0)
      }
    }
    if (!Number.isFinite(min)) return
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (rowCover[row]) matrix[row * cols + col] = (matrix[row * cols + col] ?? 0) + min
        if (!colCover[col]) matrix[row * cols + col] = (matrix[row * cols + col] ?? 0) - min
      }
    }
  }

  const augment = (startRow: number, startCol: number) => {
    const path: Array<[number, number]> = [[startRow, startCol]]
    for (;;) {
      const last = path[path.length - 1]
      if (!last) break
      const starredRow = starInCol(last[1])
      if (starredRow < 0) break
      path.push([starredRow, last[1]])
      const primedCol = primeInRow(starredRow)
      path.push([starredRow, primedCol])
    }
    for (const [row, col] of path) {
      const index = row * cols + col
      if (starred[index]) starred[index] = 0
      else starred[index] = 1
    }
    primed.fill(0)
    rowCover.fill(0)
    colCover.fill(0)
  }

  // Step 4 keeps the covers from the previous zero. Step 3 only runs again after an augment.
  let covered = coverStarredColumns()
  let guard = 0
  while (covered < rows && guard < rows * cols * 8) {
    guard += 1
    const uncovered = findZero()
    if (!uncovered) {
      adjust()
      continue
    }
    const [row, col] = uncovered
    primed[row * cols + col] = 1
    const starredCol = starInRow(row)
    if (starredCol < 0) {
      augment(row, col)
      covered = coverStarredColumns()
      continue
    }
    rowCover[row] = 1
    colCover[starredCol] = 0
  }

  const assignment = new Int32Array(rows)
  for (let row = 0; row < rows; row += 1) assignment[row] = starInRow(row)
  return assignment
}

export function assignDistinctPaints(hexes: readonly string[], paints: readonly MatchablePaint[]): AssignedPaint[] {
  const choices = usable(paints)
  if (choices.length < hexes.length) {
    throw new Error('Not enough paints with a color')
  }
  const cost = new Float64Array(hexes.length * choices.length)
  for (let row = 0; row < hexes.length; row += 1) {
    for (let col = 0; col < choices.length; col += 1) {
      cost[row * choices.length + col] = colorDistance(hexes[row] ?? '#000000', choices[col]?.hex ?? '#000000')
    }
  }
  const columns = hungarianAssign(cost, hexes.length, choices.length)
  return Array.from(columns, (column) => {
    const paint = choices[column]
    return { id: paint?.id ?? '', hex: paint?.hex ?? '#000000' }
  })
}

export function suggestPaintIds(hexes: readonly string[], paints: readonly MatchablePaint[]): Array<string | null> {
  return hexes.map((hex) => nearestPaint(hex, paints)?.id ?? null)
}
