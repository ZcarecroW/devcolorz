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
  const captchaSitekey = computed(() => meta.value?.captcha.sitekey ?? null)
  const maxColors = computed(() => meta.value?.limits.maxColors ?? 40)

  async function loadMeta() {
    try {
      meta.value = await api.get<MetaResponse>('/meta')
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
      user.value = await api.get<UserResponse>('/auth/me')
    } catch {
      user.value = null
    }
  }

  async function bootstrap() {
    loading.value = true
    await loadMeta()
    if (meta.value?.installed) await loadUser()
    loading.value = false
    ready.value = true
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
    captchaSitekey,
    maxColors,
    bootstrap,
    loadMeta,
    login,
    logout,
    refresh,
    patchUser,
  }
})
