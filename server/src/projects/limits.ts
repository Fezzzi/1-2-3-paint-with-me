export const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024

const SOURCE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'] as const

export type SourcePhotoMime = (typeof SOURCE_PHOTO_MIME_TYPES)[number]

export function normalizeSourcePhotoMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (base === 'image/jpg' || base === 'image/pjpeg') return 'image/jpeg'
  return base
}

export function isSourcePhotoMime(mimeType: string): mimeType is SourcePhotoMime {
  return (SOURCE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)
}
