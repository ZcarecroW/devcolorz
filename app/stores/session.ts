/**
 * Server session and site metadata.
 *
 * The app is fully usable logged out, so this store is allowed to fail: if the
 * backend is missing entirely — during local frontend work, or before the
 * install wizard has run — everything still renders and only the account
 * features go quiet.
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api, setCsrfToken, type MetaResponse, type UserResponse } from '@/lib/api'

export const useSessionStore = defineStore('session', () => {
  const user = ref<UserResponse | null>(null)
  const meta = ref<MetaResponse | null>(null)
  const loading = ref(true)
  /** True when the API could not be reached at all. */
  const offline = ref(false)
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const needsSetup = computed(() => meta.value !== null && !meta.value.installed)
  const canRegister = computed(() => meta.value?.features.registration ?? false)
  /**
   * Whether the sign-up form has to ask for an invitation code.
   *
   * Defaults to true when the metadata has not arrived: asking for a code that
   * turns out to be unnecessary is a nuisance, while omitting one that turns
   * out to be required is a rejected submission.
   */
  const inviteRequired = computed(() => meta.value?.features.inviteOnly ?? true)
  /** False when the server activates new accounts without a confirmation email. */
  const emailVerificationRequired = computed(
    () => meta.value?.features.emailVerification ?? true,
  )
  const captchaSitekey = computed(() => meta.value?.captcha.sitekey ?? null)
  const maxColors = computed(() => meta.value?.limits.maxColors ?? 40)
  /**
   * The length the server will actually accept, so the meter on a sign-up form
   * cannot call a password acceptable that the server is about to reject.
   */
  const minPasswordLength = computed(() => meta.value?.limits.minPasswordLength ?? 12)

  /**
   * A deadline for the bootstrap calls.
   *
   * The router guard awaits `bootstrap()` before the first navigation resolves,
   * so an unreachable or hung backend would hold the app on a blank page
   * indefinitely. Timing out drops into the offline path the store is already
   * built for, where everything except accounts still works.
   */
  function deadline(ms = 8000): AbortSignal | undefined {
    if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(ms)
    if (typeof AbortController !== 'function') return undefined
    const controller = new AbortController()
    setTimeout(() => controller.abort(), ms)
    return controller.signal
  }

  async function loadMeta() {
    try {
      meta.value = await api.get<MetaResponse>('/meta', { signal: deadline() })
      offline.value = false
    } catch (error) {
      // A 404 here means the SPA is running without its backend, which is a
      // perfectly valid way to use the tool — everything except accounts works.
      offline.value = !(error instanceof ApiError)
      meta.value = null
    }
  }

  async function loadUser() {
    try {
      user.value = await api.get<UserResponse>('/auth/me', { signal: deadline() })
    } catch {
      user.value = null
    }
  }

  /**
   * Load metadata and the current user, once.
   *
   * The promise is kept so anything that needs the answer — the router guard,
   * most of all — can await the same call instead of racing it. The guard runs
   * on the very first navigation, before `App.vue` has mounted, so without
   * this it would decide who you are before anyone had asked the server.
   */
  let booting: Promise<void> | null = null

  async function bootstrap() {
    if (booting) return booting
    loading.value = true
    booting = (async () => {
      await loadMeta()
      if (meta.value?.installed) await loadUser()
      loading.value = false
      ready.value = true
    })()
    return booting
  }

  async function login(payload: {
    email: string
    password: string
    captchaToken?: string
    remember?: boolean
  }) {
    const result = await api.post<{ user: UserResponse; csrf: string }>('/auth/login', payload)
    // The session id rotates on login, so the old CSRF token is dead.
    setCsrfToken(result.csrf)
    user.value = result.user
    return result.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      user.value = null
      setCsrfToken(null)
    }
  }

  async function refresh() {
    await loadUser()
  }

  function patchUser(changes: Partial<UserResponse>) {
    if (user.value) user.value = { ...user.value, ...changes }
  }

  return {
    user,
    meta,
    loading,
    offline,
    ready,
    isAuthenticated,
    isAdmin,
    needsSetup,
    canRegister,
    inviteRequired,
    emailVerificationRequired,
    captchaSitekey,
    maxColors,
    minPasswordLength,
    bootstrap,
    loadMeta,
    login,
    logout,
    refresh,
    patchUser,
  }
})
