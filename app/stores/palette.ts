/**
 * The palette being edited.
 *
 * Two things shape this store:
 *
 * 1. **Colors are raw, not reactive.** A colour is `{mode, l, c, h}` and a
 *    palette can be fifty of them; wrapping each in Vue's deep proxy makes a
 *    hue drag drop frames. Swatches live in a `shallowRef` and every mutation
 *    replaces the array, so reactivity is one level deep and drags stay at
 *    60fps.
 * 2. **History is committed, not recorded.** A slider drag is one undo step,
 *    not four hundred. Mutations call `commit()` at semantic boundaries —
 *    pointer-up, blur, enter — rather than on every tick.
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { formatColor, parseColor } from '@/lib/color/convert'
import { deltaEOK } from '@/lib/color/gamut'
import { harmony, type HarmonyId, type HarmonyOptions } from '@/lib/color/harmony'
import { describeColor } from '@/lib/color/name'
import {
  constraintsFromColors,
  defaultConstraints,
  generatePalette,
  randomSeed,
  retargetConstraints,
} from '@/lib/color/random'
import { assignRoles, type RoleOptions } from '@/lib/color/roles'
import type { GeneratorConstraints, Oklch, SpaceId, Swatch } from '@/lib/color/types'
import { encodeState, type PaletteState } from '@/lib/palette/url'

/** How many colors a palette may hold. Coolors caps at 10; we do not. */
export const MIN_SWATCHES = 1
export const MAX_SWATCHES = 40
export const DEFAULT_SWATCH_COUNT = 5

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `s${idCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function makeSwatch(color: Oklch, name = '', locked = false): Swatch {
  return { id: nextId(), color, name, locked }
}

interface HistoryEntry {
  swatches: Swatch[]
  label: string
}

export type SortKey = 'lightness' | 'chroma' | 'hue' | 'temperature' | 'none'

export const usesPaletteStoreId = 'palette'

export const usePaletteStore = defineStore('palette', () => {
  /* ---------------- state ---------------- */

  const swatches = shallowRef<Swatch[]>([])
  const constraints = ref<GeneratorConstraints>(defaultConstraints('oklch'))
  const seed = ref<number | null>(null)
  const title = ref('')
  const paletteUuid = ref<string | null>(null)
  const dirty = ref(false)

  const past = shallowRef<HistoryEntry[]>([])
  const future = shallowRef<HistoryEntry[]>([])
  const historyLimit = 200
  let suppressHistory = false

  /* ---------------- derived ---------------- */

  const colors = computed(() => swatches.value.map((s) => s.color))
  const count = computed(() => swatches.value.length)
  const lockedCount = computed(() => swatches.value.filter((s) => s.locked).length)
  const allLocked = computed(() => count.value > 0 && lockedCount.value === count.value)
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const hexes = computed(() => swatches.value.map((s) => formatColor(s.color, 'hex')))

  /** Display name for a swatch: the user's, or a structural description. */
  function labelFor(swatch: Swatch): string {
    return swatch.name || describeColor(swatch.color)
  }

  /* ---------------- history ---------------- */

  function snapshot(): Swatch[] {
    return swatches.value.map((s) => ({ ...s, color: { ...s.color } }))
  }

  /**
   * Record the state *before* the change that is about to happen.
   * Call this immediately before a mutation you want undoable.
   */
  function commit(label: string) {
    if (suppressHistory) return
    const entry: HistoryEntry = { swatches: snapshot(), label }
    const next = [...past.value, entry]
    past.value = next.length > historyLimit ? next.slice(next.length - historyLimit) : next
    future.value = []
    dirty.value = true
  }

  function undo() {
    const previous = past.value[past.value.length - 1]
    if (!previous) return
    future.value = [{ swatches: snapshot(), label: previous.label }, ...future.value]
    past.value = past.value.slice(0, -1)
    suppressHistory = true
    swatches.value = previous.swatches
    suppressHistory = false
  }

  function redo() {
    const next = future.value[0]
    if (!next) return
    past.value = [...past.value, { swatches: snapshot(), label: next.label }]
    future.value = future.value.slice(1)
    suppressHistory = true
    swatches.value = next.swatches
    suppressHistory = false
  }

  function clearHistory() {
    past.value = []
    future.value = []
  }

  /* ---------------- generation ---------------- */

  /**
   * Re-roll every unlocked swatch.
   *
   * Locked colors are passed to the generator as `avoid`, so new colors keep
   * their distance from what the user chose to keep — the thing Coolors does
   * not do, which is why its locked palettes drift into near-duplicates.
   */
  function roll(label = 'Generate') {
    if (allLocked.value) return
    commit(label)
    const keep = swatches.value.filter((s) => s.locked).map((s) => s.color)
    const needed = swatches.value.filter((s) => !s.locked).length
    // No `seed` option: the generator falls back to `constraints.seed` and then
    // to a fresh one. Passing a seed here overrode the Seed field entirely, so
    // typing a number into it and pressing Generate twice produced two
    // unrelated palettes while the panel promised reproducibility.
    const generated = generatePalette({
      count: needed,
      constraints: constraints.value,
      avoid: keep,
    })
    let index = 0
    swatches.value = swatches.value.map((s) =>
      s.locked ? s : { ...s, color: generated[index++] ?? s.color, name: '' },
    )
  }

  /** Re-roll a single swatch, keeping it distinct from all the others. */
  function rollOne(id: string) {
    const target = swatches.value.find((s) => s.id === id)
    if (!target || target.locked) return
    commit('Re-roll color')
    const [color] = generatePalette({
      count: 1,
      constraints: constraints.value,
      avoid: swatches.value.filter((s) => s.id !== id).map((s) => s.color),
      seed: randomSeed(),
    })
    swatches.value = swatches.value.map((s) => (s.id === id ? { ...s, color, name: '' } : s))
  }

  /** Adopt an entire set of colors, preserving locks where the count matches. */
  function setColors(next: Oklch[], label = 'Set colors') {
    commit(label)
    swatches.value = next.map((color, i) => {
      const existing = swatches.value[i]
      return existing
        ? { ...existing, color, name: '' }
        : makeSwatch(color)
    })
  }

  /**
   * Replace the palette with a harmony built around an anchor.
   *
   * Locked colours keep theirs. The generated colour that would have landed on
   * a locked slot is dropped rather than shifted along: shifting preserves the
   * lock but slides every other hue one position over, which stops an
   * analogous set being analogous.
   */
  function applyHarmony(id: HarmonyId, options: Partial<HarmonyOptions> = {}, anchorId?: string) {
    const anchor =
      (anchorId ? swatches.value.find((s) => s.id === anchorId) : undefined) ??
      swatches.value.find((s) => s.locked) ??
      swatches.value[0]
    if (!anchor) return
    const generated = harmony(anchor.color, id, { count: count.value, ...options })
    const merged = swatches.value.map((s, i) => (s.locked ? s.color : (generated[i] ?? s.color)))
    setColors(merged, `Harmony: ${id}`)
  }

  /* ---------------- editing ---------------- */

  function setColor(id: string, color: Oklch, label = 'Edit color') {
    const index = swatches.value.findIndex((s) => s.id === id)
    if (index < 0) return
    if (label) commit(label)
    const next = swatches.value.slice()
    next[index] = { ...next[index], color }
    swatches.value = next
  }

  /**
   * Live-update a color without touching history.
   *
   * Used while a slider is being dragged; the caller commits on pointer-up.
   * Replaces the array rather than mutating it and calling `triggerRef`: the
   * computeds woke up either way, but a watcher whose source is a getter only
   * fires when the returned value *changes identity*, so the studio's URL sync
   * never ran and the address bar kept a share link for the colour the swatch
   * used to be.
   */
  function previewColor(id: string, color: Oklch) {
    const index = swatches.value.findIndex((s) => s.id === id)
    if (index < 0) return
    const next = swatches.value.slice()
    next[index] = { ...next[index], color }
    swatches.value = next
  }

  function setName(id: string, name: string) {
    commit('Rename color')
    swatches.value = swatches.value.map((s) => (s.id === id ? { ...s, name } : s))
  }

  function toggleLock(id: string) {
    commit('Toggle lock')
    swatches.value = swatches.value.map((s) => (s.id === id ? { ...s, locked: !s.locked } : s))
  }

  function setAllLocks(locked: boolean) {
    commit(locked ? 'Lock all' : 'Unlock all')
    swatches.value = swatches.value.map((s) => ({ ...s, locked }))
  }

  function invertLocks() {
    commit('Invert locks')
    swatches.value = swatches.value.map((s) => ({ ...s, locked: !s.locked }))
  }

  /**
   * Insert a color at `index`.
   *
   * With no color given we interpolate between the neighbours rather than
   * generating a random one — inserting between two colors almost always means
   * "I want the step in between", and a random insert destroys the ramp.
   */
  function addSwatch(index = count.value, color?: Oklch) {
    if (count.value >= MAX_SWATCHES) return
    commit('Add color')
    const before = swatches.value[index - 1]
    const after = swatches.value[index]
    let next = color
    if (!next) {
      if (before && after) {
        next = mixOklch(before.color, after.color, 0.5)
      } else if (before) {
        next = generatePalette({ count: 1, constraints: constraints.value, avoid: colors.value, seed: randomSeed() })[0]
      } else {
        next = generatePalette({ count: 1, constraints: constraints.value, seed: randomSeed() })[0]
      }
    }
    const list = swatches.value.slice()
    list.splice(index, 0, makeSwatch(next))
    swatches.value = list
  }

  function removeSwatch(id: string) {
    if (count.value <= MIN_SWATCHES) return
    commit('Remove color')
    swatches.value = swatches.value.filter((s) => s.id !== id)
  }

  function moveSwatch(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= count.value || to >= count.value) return
    commit('Reorder')
    const list = swatches.value.slice()
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    swatches.value = list
  }

  function setCount(next: number) {
    const target = Math.max(MIN_SWATCHES, Math.min(MAX_SWATCHES, Math.round(next)))
    if (target === count.value) return
    commit('Change count')
    if (target < count.value) {
      // Drop unlocked colors from the end first, so locks survive shrinking.
      const list = swatches.value.slice()
      while (list.length > target) {
        const removable = [...list].reverse().find((s) => !s.locked)
        const index = removable ? list.indexOf(removable) : list.length - 1
        list.splice(index, 1)
      }
      swatches.value = list
    } else {
      const extra = generatePalette({
        count: target - count.value,
        constraints: constraints.value,
        avoid: colors.value,
        seed: randomSeed(),
      })
      swatches.value = [...swatches.value, ...extra.map((c) => makeSwatch(c))]
    }
  }

  function sortBy(key: SortKey) {
    if (key === 'none') return
    commit(`Sort by ${key}`)
    const value = (s: Swatch) => {
      switch (key) {
        case 'lightness':
          return -(s.color.l ?? 0)
        case 'chroma':
          return -(s.color.c ?? 0)
        case 'hue':
          return s.color.h ?? 0
        case 'temperature': {
          // Warm hues (reds through yellows) first, cool ones last. Measured as
          // distance from 60 degrees, the warmest point of the OKLCH wheel.
          const h = s.color.h ?? 0
          const d = Math.abs(((h - 60) % 360 + 360) % 360)
          return d > 180 ? 360 - d : d
        }
        default:
          return 0
      }
    }
    swatches.value = swatches.value.slice().sort((a, b) => value(a) - value(b))
  }

  function shuffle() {
    commit('Shuffle')
    const list = swatches.value.slice()
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    swatches.value = list
  }

  function reverse() {
    commit('Reverse')
    swatches.value = swatches.value.slice().reverse()
  }

  /* ---------------- constraints ---------------- */

  function setSpace(space: SpaceId) {
    constraints.value = retargetConstraints(constraints.value, space)
  }

  function resetConstraints(space?: SpaceId) {
    constraints.value = defaultConstraints(space ?? constraints.value.space)
  }

  /** Derive constraints from the current palette — "more like this". */
  function learnConstraints(padding = 0.05) {
    if (!count.value) return
    const learned = constraintsFromColors(colors.value, constraints.value.space, padding)
    learned.minDistance = constraints.value.minDistance
    learned.gamut = constraints.value.gamut
    constraints.value = learned
  }

  /* ---------------- roles & serialisation ---------------- */

  function roles(options: Partial<RoleOptions> = {}) {
    return assignRoles(colors.value, options)
  }

  function toState(): PaletteState {
    return {
      colors: colors.value,
      locks: swatches.value.map((s) => s.locked),
      names: swatches.value.map((s) => s.name),
      seed: seed.value,
    }
  }

  function loadState(state: PaletteState, label = 'Load palette') {
    if (!state.colors.length) return
    commit(label)
    swatches.value = state.colors.map((color, i) =>
      makeSwatch(color, state.names?.[i] ?? '', Boolean(state.locks?.[i])),
    )
    if (state.seed !== undefined) seed.value = state.seed
  }

  async function shareUrl(): Promise<string> {
    const encoded = await encodeState(toState())
    const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : ''
    return `${base}#/p/${encoded}`
  }

  /** Parse pasted text — a hex list, a CSS block, anything with colors in it. */
  function importFromText(text: string): number {
    const found: Oklch[] = []
    const pattern =
      /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^)]*\)|\b[0-9a-f]{6}\b/gi
    for (const match of text.match(pattern) ?? []) {
      const parsed = parseColor(match)
      if (!parsed) continue
      // Skip near-duplicates: pasted CSS repeats the same color many times.
      if (found.some((c) => deltaEOK(c, parsed) < 0.005)) continue
      found.push(parsed)
      if (found.length >= MAX_SWATCHES) break
    }
    if (!found.length) return 0
    commit('Import colors')
    swatches.value = found.map((c) => makeSwatch(c))
    return found.length
  }

  /* ---------------- lifecycle ---------------- */

  /**
   * How many colours a brand-new palette gets.
   *
   * A ref rather than the constant, so the instance's `engine.defaultSwatchCount`
   * setting can reach it before the first roll.
   */
  const defaultCount = ref(DEFAULT_SWATCH_COUNT)

  function setDefaultCount(n: number) {
    defaultCount.value = Math.max(MIN_SWATCHES, Math.min(MAX_SWATCHES, Math.round(n)))
  }

  function init(initial?: PaletteState | null) {
    suppressHistory = true
    if (initial?.colors.length) {
      swatches.value = initial.colors.map((color, i) =>
        makeSwatch(color, initial.names?.[i] ?? '', Boolean(initial.locks?.[i])),
      )
      if (initial.seed != null) seed.value = initial.seed
    } else {
      const generated = generatePalette({
        count: defaultCount.value,
        constraints: constraints.value,
        seed: randomSeed(),
      })
      swatches.value = generated.map((c) => makeSwatch(c))
    }
    suppressHistory = false
    clearHistory()
    dirty.value = false
  }

  return {
    swatches,
    constraints,
    seed,
    title,
    paletteUuid,
    dirty,
    past,
    future,
    colors,
    count,
    hexes,
    lockedCount,
    allLocked,
    canUndo,
    canRedo,
    labelFor,
    commit,
    undo,
    redo,
    clearHistory,
    roll,
    rollOne,
    setColors,
    applyHarmony,
    setColor,
    previewColor,
    setName,
    toggleLock,
    setAllLocks,
    invertLocks,
    addSwatch,
    removeSwatch,
    moveSwatch,
    setCount,
    sortBy,
    shuffle,
    reverse,
    setSpace,
    resetConstraints,
    learnConstraints,
    roles,
    toState,
    setDefaultCount,
    loadState,
    shareUrl,
    importFromText,
    init,
  }
})

/** Midpoint of two colors along the shortest hue arc. */
function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  const ha = a.h ?? 0
  const hb = b.h ?? 0
  let dh = hb - ha
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return {
    mode: 'oklch',
    l: (a.l ?? 0) + ((b.l ?? 0) - (a.l ?? 0)) * t,
    c: (a.c ?? 0) + ((b.c ?? 0) - (a.c ?? 0)) * t,
    h: ((ha + dh * t) % 360 + 360) % 360,
  }
}
