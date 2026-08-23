/**
 * Color naming.
 *
 * Two layers:
 *   • a small always-loaded set of hue-family names, so every swatch has a
 *     sensible label immediately, and
 *   • a lazily fetched 4,959-name curated list for the evocative names people
 *     actually want ("Persian Plum", not "dark red").
 *
 * Nearest-name lookup runs in OKLab with ΔEOK, not in RGB. Matching in RGB is
 * why other tools call a muted teal "Lime": Euclidean distance in RGB has
 * almost nothing to do with which colors look alike.
 */

import type { Oklch } from 'culori'
import type { ColorInput } from './types'
import { toOklab, toOklch } from './convert'
import { deltaEOK } from './gamut'

/* ------------------------------------------------------------------ *
 * Instant, dependency-free descriptive naming
 * ------------------------------------------------------------------ */

interface HueFamily {
  /** Upper bound of the hue arc, exclusive. */
  max: number
  name: string
}

/** Hue families on the OKLCH wheel, tuned to where each family actually sits. */
const HUE_FAMILIES: HueFamily[] = [
  { max: 16, name: 'Rose' },
  { max: 40, name: 'Red' },
  { max: 68, name: 'Orange' },
  { max: 98, name: 'Amber' },
  { max: 120, name: 'Yellow' },
  { max: 134, name: 'Lime' },
  { max: 150, name: 'Green' },
  { max: 168, name: 'Emerald' },
  { max: 186, name: 'Teal' },
  { max: 212, name: 'Cyan' },
  { max: 248, name: 'Sky' },
  { max: 278, name: 'Blue' },
  { max: 292, name: 'Indigo' },
  { max: 310, name: 'Violet' },
  { max: 324, name: 'Purple' },
  { max: 340, name: 'Magenta' },
  { max: 360, name: 'Pink' },
]

function hueFamily(hue: number): string {
  const h = ((hue % 360) + 360) % 360
  for (const family of HUE_FAMILIES) if (h < family.max) return family.name
  return 'Red'
}

function lightnessWord(l: number): string {
  if (l < 0.1) return 'Near-black'
  if (l < 0.26) return 'Very dark'
  if (l < 0.4) return 'Dark'
  // The mid band is deliberately wide: pure red sits at OKLCH L 0.63 and
  // calling it "light red" would be worse than saying nothing about lightness.
  if (l < 0.68) return ''
  if (l < 0.82) return 'Light'
  if (l < 0.93) return 'Very light'
  return 'Near-white'
}

function chromaWord(c: number, l: number): string {
  const ceiling = 0.33 * (1 - Math.abs(l - 0.6) * 1.2)
  const ratio = ceiling > 0 ? c / ceiling : 0
  if (c < 0.012) return 'Grey'
  if (ratio < 0.2) return 'Muted'
  if (ratio < 0.45) return 'Soft'
  if (ratio < 0.75) return ''
  return 'Vivid'
}

/**
 * A structural description of a color, always available and never wrong:
 * "Vivid dark azure", "Near-white grey".
 */
export function describeColor(color: ColorInput): string {
  const c = toOklch(color) as Oklch
  const l = c.l ?? 0
  const chroma = c.c ?? 0
  if (chroma < 0.012) {
    if (l < 0.06) return 'Black'
    if (l > 0.97) return 'White'
    return `${lightnessWord(l) || 'Mid'} grey`.replace(/^\w/, (m) => m.toUpperCase())
  }
  const parts = [chromaWord(chroma, l), lightnessWord(l).toLowerCase(), hueFamily(c.h ?? 0).toLowerCase()]
  const joined = parts.filter(Boolean).join(' ')
  return joined.replace(/^\w/, (m) => m.toUpperCase())
}

/** Just the hue family — used for grouping and for export variable names. */
export function familyOf(color: ColorInput): string {
  const c = toOklch(color) as Oklch
  if ((c.c ?? 0) < 0.012) return 'Grey'
  return hueFamily(c.h ?? 0)
}

/* ------------------------------------------------------------------ *
 * Curated nearest-name lookup
 * ------------------------------------------------------------------ */

interface NameIndex {
  names: string[]
  /** Flat OKLab triples, three floats per entry. */
  lab: Float32Array
}

let indexPromise: Promise<NameIndex> | null = null

/**
 * Load and index the curated name list. Called on demand; the data lives in
 * its own chunk so the initial bundle never pays for it.
 */
export function loadNameIndex(): Promise<NameIndex> {
  if (indexPromise) return indexPromise
  indexPromise = import('./names.data').then(({ HEXES, NAMES, COUNT }) => {
    const names = NAMES.split('\n')
    const lab = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      const hex = HEXES.slice(i * 6, i * 6 + 6)
      const value = Number.parseInt(hex, 16)
      const rgb = {
        mode: 'rgb' as const,
        r: ((value >> 16) & 0xff) / 255,
        g: ((value >> 8) & 0xff) / 255,
        b: (value & 0xff) / 255,
      }
      const ok = toOklab(rgb) as { l: number; a: number; b: number }
      lab[i * 3] = ok.l
      lab[i * 3 + 1] = ok.a
      lab[i * 3 + 2] = ok.b
    }
    return { names, lab }
  })
  return indexPromise
}

export interface NamedColor {
  name: string
  /** ΔEOK × 100 from the queried color. Under 2 is an excellent match. */
  distance: number
}

/** The closest curated name to a color, matched perceptually. */
export async function nearestName(color: ColorInput): Promise<NamedColor> {
  const { names, lab } = await loadNameIndex()
  const target = toOklab(color) as { l: number; a: number; b: number }
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < names.length; i++) {
    const dl = lab[i * 3] - target.l
    const da = lab[i * 3 + 1] - target.a
    const db = lab[i * 3 + 2] - target.b
    const d = dl * dl + da * da + db * db
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return { name: names[best], distance: Math.sqrt(bestDistance) * 100 }
}

/** The n closest names, for the "rename" picker. */
export async function nearestNames(color: ColorInput, n = 8): Promise<NamedColor[]> {
  const { names, lab } = await loadNameIndex()
  const target = toOklab(color) as { l: number; a: number; b: number }
  const scored: NamedColor[] = []
  for (let i = 0; i < names.length; i++) {
    const dl = lab[i * 3] - target.l
    const da = lab[i * 3 + 1] - target.a
    const db = lab[i * 3 + 2] - target.b
    scored.push({ name: names[i], distance: Math.sqrt(dl * dl + da * da + db * db) * 100 })
  }
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, n)
}

/** Free-text search over the curated list, for the name picker's search box. */
export async function searchNames(query: string, limit = 30): Promise<Array<{ name: string; index: number }>> {
  const { names } = await loadNameIndex()
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: Array<{ name: string; index: number }> = []
  for (let i = 0; i < names.length && out.length < limit; i++) {
    if (names[i].toLowerCase().includes(q)) out.push({ name: names[i], index: i })
  }
  return out
}

/** Look up the color behind a curated name, for search results. */
export async function colorForName(index: number): Promise<Oklch> {
  const { HEXES } = await import('./names.data')
  const hex = HEXES.slice(index * 6, index * 6 + 6)
  return toOklch(`#${hex}`) as Oklch
}

/* ------------------------------------------------------------------ *
 * Variable-name slugs
 * ------------------------------------------------------------------ */

/** Turn any label into a safe CSS custom-property fragment. */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'color'
  )
}

/**
 * Assign unique slugs to a list of labels, appending `-2`, `-3` … on collision.
 * Export would otherwise silently emit duplicate custom properties, where the
 * last one quietly wins.
 */
export function uniqueSlugs(labels: string[]): string[] {
  // The set holds what was *emitted*, not what was asked for: counting bare
  // bases let ['Blue', 'Blue 2', 'Blue'] emit `blue-2` twice, since the third
  // label's generated suffix landed on the second label's real name.
  const used = new Set<string>()
  return labels.map((label) => {
    const base = slugify(label)
    let candidate = base
    let n = 1
    while (used.has(candidate)) candidate = `${base}-${++n}`
    used.add(candidate)
    return candidate
  })
}

/** Perceptual distance in the same ΔEOK×100 units used across the app. */
export function distance(a: ColorInput, b: ColorInput): number {
  return deltaEOK(a, b) * 100
}
