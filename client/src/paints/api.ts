import { apiFetch, apiJson, apiUpload } from '../api/http.ts'

export type PaintJson = {
  id: string
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: number | null
  unit: string | null
  notes: string | null
  referenceFileId: string | null
  createdAt: string
  updatedAt: string
}

export type PaintInput = {
  manufacturer: string | null
  productLine: string | null
  manufacturerCode: string | null
  label: string | null
  hex: string | null
  quantityOnHand: number | null
  unit: string | null
  notes: string | null
}

function paintPath(id: string): string {
  return `/api/paints/${encodeURIComponent(id)}`
}

export function paintFileUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}`
}

export async function listPaints(): Promise<PaintJson[]> {
  const body = await apiJson<unknown>('/api/paints')
  if (!Array.isArray(body)) throw new Error('Could not load paints.')
  return body as PaintJson[]
}

export async function getPaint(id: string): Promise<PaintJson> {
  return apiJson<PaintJson>(paintPath(id))
}

export async function createPaint(input: PaintInput): Promise<PaintJson> {
  return apiJson<PaintJson>('/api/paints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function updatePaint(id: string, patch: Partial<PaintInput>): Promise<PaintJson> {
  return apiJson<PaintJson>(paintPath(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function deletePaint(id: string): Promise<void> {
  await apiJson(paintPath(id), { method: 'DELETE' })
}

export async function importPaints(file: File): Promise<number> {
  const text = (await file.text()).replace(/^\uFEFF/, '')
  const mediaType = file.name.toLowerCase().endsWith('.csv') ? 'text/csv' : 'application/json'
  const body = await apiJson<{ imported?: unknown }>('/api/paints/import', {
    method: 'POST',
    headers: { 'Content-Type': mediaType },
    body: text,
  })
  if (typeof body.imported !== 'number' || !Number.isFinite(body.imported)) {
    throw new Error('Could not import paints.')
  }
  return body.imported
}

export async function downloadPaintExport(format: 'json' | 'csv'): Promise<void> {
  const response = await apiFetch(`/api/paints/export?format=${format}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = format === 'csv' ? 'paints.csv' : 'paints.json'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function uploadPaintReference(id: string, file: File): Promise<PaintJson> {
  const body = new FormData()
  body.append('file', file)
  return apiUpload<PaintJson>(`${paintPath(id)}/reference`, body)
}
