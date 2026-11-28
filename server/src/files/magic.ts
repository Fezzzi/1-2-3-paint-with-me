const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
  'heif',
])

export type DetectedImage = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic'

export function detectImage(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0)
    if (HEIF_BRANDS.has(brand)) return 'heic'
  }
  return null
}

export function imageMatchesMime(detected: DetectedImage, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return detected === 'jpeg'
  if (mimeType === 'image/png') return detected === 'png'
  if (mimeType === 'image/gif') return detected === 'gif'
  if (mimeType === 'image/webp') return detected === 'webp'
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return detected === 'heic'
  return false
}
