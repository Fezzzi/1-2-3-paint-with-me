export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const SESSION_EXPIRED_EVENT = 'paint:session-expired'

const QUIET_401 = new Set([
  'GET /api/auth/config',
  'GET /api/auth/me',
  'POST /api/auth/google',
  'POST /api/auth/dev-login',
  'POST /api/auth/logout',
])

function routeKey(url: string, method: string): string {
  const path = url.split('?')[0] ?? url
  return `${method.toUpperCase()} ${path}`
}

const sessionEvents = new EventTarget()

export function notifySessionExpired(): void {
  sessionEvents.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}

export function onSessionExpired(listener: () => void): () => void {
  sessionEvents.addEventListener(SESSION_EXPIRED_EVENT, listener)
  return () => sessionEvents.removeEventListener(SESSION_EXPIRED_EVENT, listener)
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: unknown; code?: unknown }
    const message = typeof body.error === 'string' && body.error.trim() ? body.error : response.statusText || 'Request failed'
    const code = typeof body.code === 'string' ? body.code : undefined
    return new ApiError(response.status, message, code)
  } catch {
    return new ApiError(response.status, response.statusText || 'Request failed')
  }
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { credentials: 'include', ...init })
  } catch {
    throw new ApiError(0, 'Could not reach the server.')
  }
  const method = init.method ?? 'GET'
  if (response.status === 401 && !QUIET_401.has(routeKey(url, method))) notifySessionExpired()
  if (!response.ok) throw await errorFromResponse(response)
  return response
}

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(url, init)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function apiUpload<T>(url: string, body: FormData, onProgress?: (ratio: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', url)
    request.withCredentials = true
    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return
      onProgress(event.loaded / event.total)
    }
    request.onload = () => {
      const status = request.status
      if (status === 401) notifySessionExpired()
      if (status < 200 || status >= 300) {
        let message = 'Upload failed.'
        let code: string | undefined
        try {
          const payload = JSON.parse(request.responseText) as { error?: unknown; code?: unknown }
          if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error
          if (typeof payload.code === 'string') code = payload.code
        } catch {
          message = request.statusText || message
        }
        reject(new ApiError(status, message, code))
        return
      }
      try {
        resolve(JSON.parse(request.responseText) as T)
      } catch {
        reject(new ApiError(status, 'Upload failed.'))
      }
    }
    request.onerror = () => reject(new ApiError(0, 'Could not reach the server.'))
    request.send(body)
  })
}
