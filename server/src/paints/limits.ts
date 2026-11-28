export const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024

export const REFERENCE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const

export type ReferenceImageMime = (typeof REFERENCE_IMAGE_MIME_TYPES)[number]

export function isReferenceImageMime(mimeType: string): mimeType is ReferenceImageMime {
  return (REFERENCE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)
}
