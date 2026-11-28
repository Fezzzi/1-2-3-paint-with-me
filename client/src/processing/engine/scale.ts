export function pxPerMm(widthPx: number, paperWidthMm: number, marginMm: number): number {
  const printable = Math.max(1, paperWidthMm - 2 * marginMm)
  if (!(widthPx > 0) || !Number.isFinite(printable)) return 1
  return widthPx / printable
}
