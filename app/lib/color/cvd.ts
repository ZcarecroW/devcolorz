/**
 * Color vision deficiency simulation.
 *
 * Uses the Machado, Oliveira & Fernandes (2009) model, which handles partial
 * deficiency properly rather than only the dichromatic extremes — roughly 5%
 * of men have anomalous trichromacy, not full dichromacy, so severity matters.
 *
 * The matrices are applied in **linear-light RGB**, which is how the paper
 * defines them. Most JavaScript implementations — culori's built-in filters
 * included — multiply them against gamma-encoded sRGB instead. That is a real
 * error, not a rounding difference: it makes simulated colors too light and
 * shifts their hue, which in turn hides collisions a color-blind user would
 * actually run into.
 */

import type { Oklch, Rgb } from 'culori'
import { toLrgb, toOklch, toRgb } from './convert'
import { deltaEOK } from './gamut'
import { DEUTAN, PROTAN, TRITAN, type Matrix9 } from './cvd.data'
import type { ColorInput } from './types'

export type CvdType =
  | 'none'
  | 'protanopia'
  | 'protanomaly'
  | 'deuteranopia'
  | 'deuteranomaly'
  | 'tritanopia'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly'

interface CvdDef {
  id: CvdType
  label: string
  /** Share of the population affected, as shown in the UI. */
  prevalence: string
  hint: string
  /** Which matrix table to use; `null` selects the greyscale path. */
  table: readonly Matrix9[] | null
  /** 0–1. Anopia is 1 (no working cones), anomaly is partial. */
  severity: number
}

export const CVD_TYPES: Record<CvdType, CvdDef> = {
  none: {
    id: 'none',
    label: 'Normal vision',
    prevalence: '~92% of people',
    hint: 'Full trichromatic vision — the palette exactly as authored.',
    table: null,
    severity: 0,
  },
  protanopia: {
    id: 'protanopia',
    label: 'Protanopia',
    prevalence: '~1% of men',
    hint: 'No working long-wavelength (red) cones. Reds darken dramatically and collapse toward the greens, so a red error state can become indistinguishable from a green success state — and dark red on a dark background effectively disappears.',
    table: PROTAN,
    severity: 1,
  },
  protanomaly: {
    id: 'protanomaly',
    label: 'Protanomaly',
    prevalence: '~1% of men',
    hint: 'Reduced red sensitivity. Reds look duller and shift toward green, but because the deficiency is partial some red–green distinction survives.',
    table: PROTAN,
    severity: 0.6,
  },
  deuteranopia: {
    id: 'deuteranopia',
    label: 'Deuteranopia',
    prevalence: '~1% of men',
    hint: 'No working medium-wavelength (green) cones — the most common form of severe color blindness. Reds and greens converge on a muddy yellow-brown. Unlike protanopia, overall lightness is roughly preserved, which is exactly what makes it easy to miss while designing.',
    table: DEUTAN,
    severity: 1,
  },
  deuteranomaly: {
    id: 'deuteranomaly',
    label: 'Deuteranomaly',
    prevalence: '~5% of men',
    hint: 'Reduced green sensitivity, and by far the most common deficiency of all. Mild enough that many people are never diagnosed — which is why palettes need to survive it.',
    table: DEUTAN,
    severity: 0.6,
  },
  tritanopia: {
    id: 'tritanopia',
    label: 'Tritanopia',
    prevalence: '<0.01%, all genders equally',
    hint: 'No working short-wavelength (blue) cones. Blues turn green and yellows turn pink or grey. Rare, and inherited independently of the red–green types.',
    table: TRITAN,
    severity: 1,
  },
  tritanomaly: {
    id: 'tritanomaly',
    label: 'Tritanomaly',
    prevalence: '<0.01%',
    hint: 'Reduced blue sensitivity. Blue–green and yellow–red distinctions become harder to make.',
    table: TRITAN,
    severity: 0.6,
  },
  achromatopsia: {
    id: 'achromatopsia',
    label: 'Achromatopsia',
    prevalence: '~1 in 30,000',
    hint: 'No color vision at all. Also the best proxy you have for greyscale printing, cheap projectors and e-ink: if the palette still works here, lightness alone is carrying the meaning — the strongest guarantee a palette can offer.',
    table: null,
    severity: 1,
  },
  achromatomaly: {
    id: 'achromatomaly',
    label: 'Achromatomaly',
    prevalence: 'very rare',
    hint: 'Severely reduced but not absent color perception.',
    table: null,
    severity: 0.7,
  },
}

export const CVD_IDS = Object.keys(CVD_TYPES) as CvdType[]

/** The set worth checking every palette against. */
export const CVD_AUDIT_SET: CvdType[] = [
  'deuteranomaly',
  'deuteranopia',
  'protanopia',
  'tritanopia',
  'achromatopsia',
]

/** Interpolate between the two nearest severity steps in a matrix table. */
function matrixFor(table: readonly Matrix9[], severity: number): Matrix9 {
  const clamped = Math.min(1, Math.max(0, severity))
  const position = clamped * (table.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(table.length - 1, lower + 1)
  const t = position - lower
  if (t === 0) return table[lower]
  const a = table[lower]
  const b = table[upper]
  return a.map((v, i) => v + (b[i] - v) * t) as unknown as Matrix9
}

/**
 * Rec. 709 luminance weights, applied in linear light.
 *
 * Greyscaling in gamma space — which is what `filter: grayscale()` and most
 * naive implementations do — makes saturated colors come out too light.
 */
const LUMA = [0.2126, 0.7152, 0.0722] as const

/** Simulate how a color appears under a given deficiency. */
export function simulate(color: ColorInput, type: CvdType): Oklch {
  const def = CVD_TYPES[type] ?? CVD_TYPES.none
  if (type === 'none') return toOklch(color)

  const linear = toLrgb(color)
  const { r, g, b } = linear

  let out: { r: number; g: number; b: number }
  if (def.table) {
    const m = matrixFor(def.table, def.severity)
    out = {
      r: m[0] * r + m[1] * g + m[2] * b,
      g: m[3] * r + m[4] * g + m[5] * b,
      b: m[6] * r + m[7] * g + m[8] * b,
    }
  } else {
    const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b
    const s = def.severity
    out = { r: r + (y - r) * s, g: g + (y - g) * s, b: b + (y - b) * s }
  }

  const srgb: Rgb = toRgb({
    mode: 'lrgb',
    r: Math.min(1, Math.max(0, out.r)),
    g: Math.min(1, Math.max(0, out.g)),
    b: Math.min(1, Math.max(0, out.b)),
    ...(linear.alpha !== undefined ? { alpha: linear.alpha } : {}),
  } as unknown as Rgb)
  return toOklch(srgb)
}

/** Simulate a whole palette. */
export function simulatePalette(colors: ColorInput[], type: CvdType): Oklch[] {
  if (type === 'none') return colors.map((c) => toOklch(c))
  return colors.map((c) => simulate(c, type))
}

/**
 * The equivalent `feColorMatrix` values, for applying a simulation to live DOM.
 *
 * SVG filters interpolate in linearRGB by default, so the browser does the
 * linearisation for us and the on-screen result matches `simulate()`. If you
 * put this on an element, do not override `color-interpolation-filters`.
 */
export function svgMatrixFor(type: CvdType): number[] {
  const def = CVD_TYPES[type] ?? CVD_TYPES.none
  if (type === 'none') {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
  }
  let m: Matrix9
  if (def.table) {
    m = matrixFor(def.table, def.severity)
  } else {
    const s = def.severity
    const k = (weight: number, keep: number) => keep * (1 - s) + weight * s
    m = [
      k(LUMA[0], 1), k(LUMA[1], 0), k(LUMA[2], 0),
      k(LUMA[0], 0), k(LUMA[1], 1), k(LUMA[2], 0),
      k(LUMA[0], 0), k(LUMA[1], 0), k(LUMA[2], 1),
    ] as unknown as Matrix9
  }
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ]
}

export interface CvdCollision {
  a: number
  b: number
  type: CvdType
  /** ΔEOK × 100 between the two colors under this deficiency. */
  distance: number
  /** ΔEOK × 100 between the same two colors in normal vision. */
  originalDistance: number
}

/**
 * Find pairs that become confusable under any audited deficiency.
 *
 * `threshold` is in ΔEOK×100 units; 5 is roughly "a careful eye can still tell
 * them apart", 2 is "these are the same color now".
 */
export function findCollisions(colors: ColorInput[], threshold = 5): CvdCollision[] {
  const out: CvdCollision[] = []
  for (const type of CVD_AUDIT_SET) {
    const simulated = simulatePalette(colors, type)
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const distance = deltaEOK(simulated[i], simulated[j]) * 100
        if (distance >= threshold) continue
        const originalDistance = deltaEOK(colors[i], colors[j]) * 100
        // Colors that were already near-identical are the author's problem,
        // not the deficiency's — only report pairs that genuinely collapse.
        if (originalDistance < threshold * 1.5) continue
        out.push({ a: i, b: j, type, distance, originalDistance })
      }
    }
  }
  return out.sort((x, y) => x.distance - y.distance)
}

/**
 * A single 0–100 score for how well a palette survives color blindness:
 * the fraction of distinguishable pairs that stay distinguishable.
 */
export function cvdSafetyScore(colors: ColorInput[], threshold = 5): number {
  if (colors.length < 2) return 100
  let pairs = 0
  let survived = 0
  const simulations = new Map<CvdType, Oklch[]>()
  for (const type of CVD_AUDIT_SET) simulations.set(type, simulatePalette(colors, type))

  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (deltaEOK(colors[i], colors[j]) * 100 < threshold * 1.5) continue
      pairs++
      let worst = Infinity
      for (const type of CVD_AUDIT_SET) {
        const sim = simulations.get(type)!
        const d = deltaEOK(sim[i], sim[j]) * 100
        if (d < worst) worst = d
      }
      if (worst >= threshold) survived++
    }
  }
  return pairs === 0 ? 100 : Math.round((survived / pairs) * 100)
}
