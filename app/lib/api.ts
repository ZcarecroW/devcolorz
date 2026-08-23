/**
 * The API client.
 *
 * Session cookies do the authenticating, so nothing here touches
 * `localStorage`: a single XSS in a tool that renders user-supplied CSS would
 * otherwise hand over every token. The cost is CSRF, which the synchronizer
 * token below handles.
 */

export interface ProblemDetail {
  type?: string
  title: string
  status: number
  detail?: string
  /** Field-level validation messages, keyed by field name. */
  errors?: Record<string, string>
  /** Set when the endpoint wants an hCaptcha solution before it will proceed. */
  captcha?: boolean
  /** Seconds to wait, echoed from `Retry-After`. */
  retryAfter?: number
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetail

  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title || `Request failed (${problem.status})`)
    this.name = 'ApiError'
    this.status = problem.status
    this.problem = problem
  }

  /** True when the failure is the user's input rather than the system's fault. */
  get isValidation(): boolean {
    return this.status === 422 || this.status === 400
  }

  get needsCaptcha(): boolean {
    return Boolean(this.problem.captcha)
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }
}

const BASE = '/api'

let csrfToken: string | null = null
/** In-flight CSRF fetch, so a burst of writes issues exactly one request. */
let csrfPromise: Promise<string> | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

export function getCsrfToken(): string | null {
  return csrfToken
}

async function fetchCsrf(): Promise<string> {
  if (csrfToken) return csrfToken
  if (!csrfPromise) {
    csrfPromise = fetch(`${BASE}/csrf`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('csrf'))))
      .then((data: { token: string }) => {
        csrfToken = data.token
        return data.token
      })
      .finally(() => {
        csrfPromise = null
      })
  }
  return csrfPromise
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Query parameters; `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /** Skip the CSRF round-trip — only for endpoints that do not need it. */
  skipCsrf?: boolean
  headers?: Record<string, string>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function toProblem(response: Response): Promise<ProblemDetail> {
  const fallback: ProblemDetail = {
    title: response.statusText || 'Request failed',
    status: response.status,
  }
  const retryAfter = Number(response.headers.get('Retry-After'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) fallback.retryAfter = retryAfter
  try {
    const data = (await response.json()) as Partial<ProblemDetail>
    return { ...fallback, ...data, status: data.status ?? response.status }
  } catch {
    return fallback
  }
}

/**
 * Perform an API request.
 *
 * Writes carry the CSRF token and an explicit JSON content type — the latter
 * is not cosmetic: it forces a CORS preflight, which a cross-site form post
 * cannot produce, so it is a second independent barrier alongside the token.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const isWrite = method !== 'GET'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (isWrite && !options.skipCsrf) {
    headers['X-CSRF-Token'] = await fetchCsrf()
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    credentials: 'same-origin',
    headers,
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  // A rejected CSRF token means the session rotated underneath us. Refresh
  // once and retry, rather than making the user redo their action.
  if (response.status === 419 || (response.status === 403 && isWrite && csrfToken)) {
    csrfToken = null
    const fresh = await fetchCsrf()
    const retry = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      headers: { ...headers, 'X-CSRF-Token': fresh },
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    if (!retry.ok) throw new ApiError(await toProblem(retry))
    return (retry.status === 204 ? undefined : await retry.json()) as T
  }

  if (!response.ok) throw new ApiError(await toProblem(response))
  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

/* ------------------------------------------------------------------ *
 * Shared response shapes
 * ------------------------------------------------------------------ */

export interface MetaResponse {
  /** False before the install wizard has run. */
  installed: boolean
  appName: string
  version: string
  features: {
    registration: boolean
    explore: boolean
    anonymous: boolean
    captcha: boolean
    /** Registration also needs the administrator's invitation code. */
    inviteOnly: boolean
    /** A new account must confirm its address by email before it can sign in. */
    emailVerification: boolean
  }
  captcha: { provider: 'hcaptcha' | null; sitekey: string | null }
  limits: { maxColors: number; maxPalettes: number | null; minPasswordLength: number }
  /**
   * What a first-time visitor should start with.
   *
   * Only applied when the browser has no stored preference of its own — an
   * administrator's default is a starting point, not an override of a choice
   * the visitor has already made.
   */
  defaults?: {
    appearance: 'light' | 'dark' | 'system'
    format: string
    gamut: string
    contrastMetric: string
    darkStrategy: string
    swatchCount: number
  }
  /** Present for admins: things that need attention. */
  health?: {
    wal: boolean
    cronLastRun: number | null
    outboxQueued: number
    /**
     * Whether anything sensitive is web-reachable.
     *
     * Tri-state. `null` means the probe has not run or could not complete,
     * which is not the same as "safe" and must not be rendered as such.
     */
    storageExposed: boolean | null
    /** When the verdict above was last established. */
    storageCheckedAt?: number | null
  }
}

export interface UserResponse {
  uuid: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  status: 'pending' | 'active' | 'suspended'
  emailVerified: boolean
  createdAt: number
  prefs: Record<string, unknown>
}
