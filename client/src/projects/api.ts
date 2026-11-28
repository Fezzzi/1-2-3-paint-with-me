import { apiFetch, apiJson, apiUpload } from '../api/http.ts'

export type ProjectListJson = {
  id: string
  title: string
  status: 'draft' | 'ready'
  colorCount: number
  paperPreset: string | null
  orientation: 'portrait' | 'landscape'
  thumbnailFileId: string | null
  palette: string[]
  updatedAt: string
}

export type ProjectColorJson = {
  id: string
  number: number
  hex: string
  paintId: string | null
  areaCm2: number | null
  estimatedQuantity: number | null
  shortfall: boolean
}

export type ProjectJson = {
  id: string
  title: string
  sourceFileId: string | null
  colorCount: number
  paperPreset: string | null
  paperWidthMm: number | null
  paperHeightMm: number | null
  orientation: 'portrait' | 'landscape'
  marginMm: number | null
  coverageRate: number | null
  cropX: number | null
  cropY: number | null
  cropWidth: number | null
  cropHeight: number | null
  constrainToOwned: boolean
  status?: 'draft' | 'ready'
  detail?: 'simple' | 'balanced' | 'detailed'
  analysisFileId?: string | null
  analysisKey?: string | null
  thumbnailFileId?: string | null
  createdAt: string
  updatedAt: string
  colors: ProjectColorJson[]
}

export type ProjectColorPayload = {
  number: number
  hex: string
  paintId: string | null
  areaCm2: number
  estimatedQuantity: number
  shortfall: boolean
}

export type ProjectPatch = {
  title?: string
  colorCount?: number
  detail?: 'simple' | 'balanced' | 'detailed'
  paperPreset?: 'A5' | 'A4' | 'A3' | 'Letter' | 'custom'
  paperWidthMm?: number
  paperHeightMm?: number
  orientation?: 'portrait' | 'landscape'
  marginMm?: number
  coverageRate?: number
  crop?: { x: number; y: number; width: number; height: number } | null
  constrainToOwned?: boolean
  colors?: ProjectColorPayload[]
}

function projectPath(id: string): string {
  return `/api/projects/${encodeURIComponent(id)}`
}

export function projectFileUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}`
}

export async function listProjects(): Promise<ProjectListJson[]> {
  const body = await apiJson<unknown>('/api/projects')
  if (!Array.isArray(body)) throw new Error('Could not load projects.')
  return body as ProjectListJson[]
}

export async function getProject(id: string): Promise<ProjectJson> {
  return apiJson<ProjectJson>(projectPath(id))
}

export async function createProject(
  file: File,
  fields: { title?: string; orientation?: 'portrait' | 'landscape' },
  onProgress?: (ratio: number) => void,
): Promise<ProjectJson> {
  const body = new FormData()
  body.append('file', file)
  if (fields.title) body.append('title', fields.title)
  if (fields.orientation) body.append('orientation', fields.orientation)
  return apiUpload<ProjectJson>('/api/projects', body, onProgress)
}

export async function patchProject(id: string, patch: ProjectPatch): Promise<ProjectJson> {
  return apiJson<ProjectJson>(projectPath(id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export async function replaceProjectSource(id: string, file: File): Promise<ProjectJson> {
  const body = new FormData()
  body.append('file', file)
  const response = await apiFetch(`${projectPath(id)}/source`, { method: 'PUT', body })
  return (await response.json()) as ProjectJson
}

export async function fetchProjectFile(fileId: string): Promise<Blob> {
  const response = await apiFetch(projectFileUrl(fileId))
  return response.blob()
}

export async function fetchProjectSource(fileId: string): Promise<File> {
  const response = await apiFetch(projectFileUrl(fileId))
  const blob = await response.blob()
  const header = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const type = header && header.length > 0 ? header : blob.type || 'image/jpeg'
  return new File([blob], 'source', { type })
}

export async function putProjectAnalysis(id: string, bytes: Uint8Array, key: string): Promise<void> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  await apiFetch(`${projectPath(id)}/analysis`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-analysis-key': key },
    body: new Blob([copy], { type: 'application/octet-stream' }),
  })
}

export async function putProjectThumbnail(id: string, bytes: Blob): Promise<void> {
  await apiFetch(`${projectPath(id)}/thumbnail`, {
    method: 'PUT',
    headers: { 'content-type': bytes.type || 'image/webp' },
    body: bytes,
  })
}

export async function deleteProject(id: string): Promise<void> {
  await apiJson(projectPath(id), { method: 'DELETE' })
}
