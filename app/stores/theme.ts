/**
 * The app's own theme.
 *
 * Two independent axes, which people constantly conflate:
 *   • **appearance** — light / dark / follow the system. Cheap, reversible,
 *     and what the OS-level toggle controls.
 *   • **theme** — the 44 token values behind each appearance. This is the
 *     thing the editor edits and the exporter exports.
 *
 * Overrides are stored per mode and applied as inline custom properties on
 * `<html>`, which beats the stylesheet without a rebuild.
 */

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  ALL_TOKENS,
  RADIUS_STEPS,
  TRACKING_STEPS,
  deriveShadows,
  type ThemeDefinition,
  type TokenValues,
} from '@/lib/theme/tokens'
import { DEFAULT_THEME_ID, THEME_PRESETS, getPreset } from '@/lib/theme/presets'

export type Appearance = 'light' | 'dark' | 'system'
export type Mode = 'light' | 'dark'

const APPEARANCE_KEY = 'devcolorz:appearance'
const THEME_KEY = 'devcolorz:theme'

interface PersistedTheme {
  presetId: string
  overrides: { light: TokenValues; dark: TokenValues }
  custom: ThemeDefinition[]
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as T) } as T) : fallback
  } catch {
    return fallback
  }
}

export const useThemeStore = defineStore('theme', () => {
  const appearance = ref<Appearance>(
    (localStorage.getItem(APPEARANCE_KEY) as Appearance | null) ?? 'system',
  )
  const systemPrefersDark = ref(
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const persisted = readJson<PersistedTheme>(THEME_KEY, {
    presetId: DEFAULT_THEME_ID,
    overrides: { light: {}, dark: {} },
    custom: [],
  })

  const presetId = ref(persisted.presetId)
  const overrides = ref<{ light: TokenValues; dark: TokenValues }>({
    light: { ...persisted.overrides?.light },
    dark: { ...persisted.overrides?.dark },
  })
  const customThemes = ref<ThemeDefinition[]>(persisted.custom ?? [])

  /** The mode actually in effect right now. */
  const mode = computed<Mode>(() =>
    appearance.value === 'system'
      ? systemPrefersDark.value
        ? 'dark'
        : 'light'
      : appearance.value,
  )

  const availableThemes = computed<ThemeDefinition[]>(() => [
    ...THEME_PRESETS,
    ...customThemes.value,
  ])

  const basePreset = computed<ThemeDefinition>(
    () => availableThemes.value.find((t) => t.id === presetId.value) ?? getPreset(DEFAULT_THEME_ID),
  )

  /** Resolved token values for a mode: preset values with overrides on top. */
  function resolved(target: Mode): TokenValues {
    return { ...basePreset.value[target], ...overrides.value[target] }
  }

  const current = computed(() => resolved(mode.value))

  const isCustomised = computed(
    () =>
      Object.keys(overrides.value.light).length > 0 ||
      Object.keys(overrides.value.dark).length > 0,
  )

  /* ---------------- application ---------------- */

  function numberOf(value: string | undefined, fallback: number): number {
    const n = Number.parseFloat(value ?? '')
    return Number.isFinite(n) ? n : fallback
  }

  /**
   * Expand a token set into every custom property the stylesheet expects,
   * including the derived radius, tracking and shadow ramps.
   */
  function expand(values: TokenValues): Record<string, string> {
    const out: Record<string, string> = { ...values }
    const radius = values.radius ?? '0.625rem'
    const unit = /rem\s*$/.test(radius) ? 'rem' : 'px'
    const base = numberOf(radius, 0.625)
    for (const [name, multiplier] of RADIUS_STEPS) {
      out[`radius-${name}`] = `${Number((base * multiplier).toFixed(4))}${unit}`
    }
    const tracking = numberOf(values['letter-spacing'], 0)
    for (const [name, offset] of TRACKING_STEPS) {
      out[`tracking-${name}`] = `${Number((tracking + offset).toFixed(4))}em`
    }
    for (const [name, value] of Object.entries(deriveShadows(values))) {
      out[`shadow${name === 'DEFAULT' ? '' : `-${name}`}`] = value
    }
    return out
  }

  let appliedKeys: string[] = []

  function apply() {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const dark = mode.value === 'dark'
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'

    const next = expand(current.value)
    // Remove properties from a previous theme that this one does not set,
    // otherwise switching presets leaves orphans behind.
    for (const key of appliedKeys) {
      if (!(key in next)) root.style.removeProperty(`--${key}`)
    }
    for (const [key, value] of Object.entries(next)) {
      root.style.setProperty(`--${key}`, value)
    }
    appliedKeys = Object.keys(next)
  }

  function persist() {
    try {
      localStorage.setItem(APPEARANCE_KEY, appearance.value)
      localStorage.setItem(
        THEME_KEY,
        JSON.stringify({
          presetId: presetId.value,
          overrides: overrides.value,
          custom: customThemes.value,
        } satisfies PersistedTheme),
      )
    } catch {
      // Private browsing and storage-full both throw here; a theme that fails
      // to persist is not worth breaking the app over.
    }
  }

  /* ---------------- actions ---------------- */

  function setAppearance(next: Appearance) {
    appearance.value = next
  }

  function toggleAppearance() {
    appearance.value = mode.value === 'dark' ? 'light' : 'dark'
  }

  function selectPreset(id: string) {
    presetId.value = id
    overrides.value = { light: {}, dark: {} }
  }

  /** Override a single token in one mode, or in both when `both` is set. */
  function setToken(key: string, value: string, target: Mode | 'both' = mode.value) {
    if (target === 'both') {
      overrides.value.light = { ...overrides.value.light, [key]: value }
      overrides.value.dark = { ...overrides.value.dark, [key]: value }
    } else {
      overrides.value[target] = { ...overrides.value[target], [key]: value }
    }
  }

  function resetToken(key: string, target: Mode | 'both' = mode.value) {
    const clear = (m: Mode) => {
      const next = { ...overrides.value[m] }
      delete next[key]
      overrides.value[m] = next
    }
    if (target === 'both') {
      clear('light')
      clear('dark')
    } else {
      clear(target)
    }
  }

  function resetAll() {
    overrides.value = { light: {}, dark: {} }
  }

  /** Replace every token in one mode — used when applying a generated theme. */
  function applyTokenSet(values: TokenValues, target: Mode | 'both' = mode.value) {
    const assign = (m: Mode) => {
      overrides.value[m] = { ...overrides.value[m], ...values }
    }
    if (target === 'both') {
      assign('light')
      assign('dark')
    } else {
      assign(target)
    }
  }

  /** Freeze the current customisation as a named theme. */
  function saveAsCustom(name: string): ThemeDefinition {
    const theme: ThemeDefinition = {
      id: `custom-${Date.now().toString(36)}`,
      name,
      author: 'You',
      light: resolved('light'),
      dark: resolved('dark'),
    }
    customThemes.value = [...customThemes.value, theme]
    presetId.value = theme.id
    overrides.value = { light: {}, dark: {} }
    return theme
  }

  function deleteCustom(id: string) {
    customThemes.value = customThemes.value.filter((t) => t.id !== id)
    if (presetId.value === id) presetId.value = DEFAULT_THEME_ID
  }

  /** Watch the OS preference so `system` actually tracks the system. */
  function bindSystemPreference() {
    if (typeof matchMedia !== 'function') return () => {}
    const query = matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => {
      systemPrefersDark.value = event.matches
    }
    query.addEventListener('change', handler)
    return () => query.removeEventListener('change', handler)
  }

  watch([mode, current], apply, { immediate: true, deep: true })
  watch([appearance, presetId, overrides, customThemes], persist, { deep: true })

  return {
    appearance,
    mode,
    presetId,
    overrides,
    customThemes,
    availableThemes,
    basePreset,
    current,
    isCustomised,
    tokens: ALL_TOKENS,
    resolved,
    expand,
    apply,
    setAppearance,
    toggleAppearance,
    selectPreset,
    setToken,
    resetToken,
    resetAll,
    applyTokenSet,
    saveAsCustom,
    deleteCustom,
    bindSystemPreference,
  }
})
