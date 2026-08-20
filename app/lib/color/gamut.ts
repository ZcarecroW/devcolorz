/**
 * Gamut mapping.
 *
 * OKLCH can address colors sRGB cannot show. What you do about that is a real
 * design decision, so the engine exposes every reasonable strategy rather than
 * silently clipping like most tools do.
 */

import { clampChroma, converter, type Color, type Oklch, type Rgb } from 'culori'
import { toOklch, toRgb } from './convert'
import type { GamutStrategy } from './types'

const toOklab = converter('oklab')

export type GamutId = 'srgb' | 'p3' | 'rec2020'

const CONVERTERS: Record<GamutId, (c: Color) => Rgb> = {
  srgb: converter('rgb') as never,
  p3: converter('p3') as never,
  rec2020: converter('rec2020') as never,
}

/**
 * Tolerance for the in-gamut test.
 *
 * culori's own `inGamut` compares channels against 0 and 1 exactly, so a
 * colour that has been through an OKLCH round-trip — pure blue, say, which
 * comes back as `b: 0.9999999999999999, r: -9.3e-15` — is reported as *out* of
 * gamut. That is a floating-point artefact, not a real one, and letting it
 * through causes endless pointless gamut mapping. 1e-6 is far below anything
 * an 8-bit channel can represent.
 */
const GAMUT_EPSILON = 1e-6

/** Is this color displayable in the given gamut? */
export function isInGamut(color: Color, gamut: GamutId = 'srgb'): boolean {
  const c = CONVERTERS[gamut](color)
  return (
    c.r >= -GAMUT_EPSILON &&
    c.r <= 1 + GAMUT_EPSILON &&
    c.g >= -GAMUT_EPSILON &&
    c.g <= 1 + GAMUT_EPSILON &&
    c.b >= -GAMUT_EPSILON &&
    c.b <= 1 + GAMUT_EPSILON
  )
}

/** Naive per-channel clip. Fast, and reliably shifts hue and lightness. */
export function clipToGamut(color: Color): Oklch {
  const rgb = toRgb(color) as Rgb
  const clamped: Rgb = {
    mode: 'rgb',
    r: Math.min(1, Math.max(0, rgb.r)),
    g: Math.min(1, Math.max(0, rgb.g)),
    b: Math.min(1, Math.max(0, rgb.b)),
    ...(rgb.alpha !== undefined ? { alpha: rgb.alpha } : {}),
  }
  return toOklch(clamped) as Oklch
}

/** Reduce chroma until the color fits, keeping lightness and hue exactly. */
export function reduceChroma(color: Color): Oklch {
  return toOklch(clampChroma(toOklch(color) as Oklch, 'oklch', 'rgb')) as Oklch
}

/** Perceptual distance between two colors in OKLab, as ΔEOK. */
export function deltaEOK(a: Color, b: Color): number {
  const x = toOklab(a) as { l: number; a: number; b: number }
  const y = toOklab(b) as { l: number; a: number; b: number }
  const dl = x.l - y.l
  const da = x.a - y.a
  const db = x.b - y.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

/**
 * The CSS Color 4 gamut-mapping algorithm: binary-search chroma downward,
 * but accept an out-of-gamut candidate as soon as its clipped version is
 * within ΔEOK 0.02 of it. This keeps far more chroma than a plain reduction
 * while staying visually faithful.
 *
 * https://www.w3.org/TR/css-color-4/#css-gamut-mapping
 */
export function cssGamutMap(color: Color, gamut: GamutId = 'srgb'): Oklch {
  const origin = toOklch(color) as Oklch
  const l = origin.l ?? 0
  if (l >= 1) return { mode: 'oklch', l: 1, c: 0, h: origin.h ?? 0, ...(origin.alpha !== undefined ? { alpha: origin.alpha } : {}) }
  if (l <= 0) return { mode: 'oklch', l: 0, c: 0, h: origin.h ?? 0, ...(origin.alpha !== undefined ? { alpha: origin.alpha } : {}) }
  if (isInGamut(origin, gamut)) return origin

  const JND = 0.02
  const EPSILON = 0.0001
  let min = 0
  let max = origin.c ?? 0
  let minInGamut = true
  let current: Oklch = { ...origin }

  while (max - min > EPSILON) {
    const chroma = (min + max) / 2
    current = { ...origin, c: chroma }
    if (minInGamut && isInGamut(current, gamut)) {
      min = chroma
      continue
    }
    const clipped = clipToGamut(current)
    const distance = deltaEOK(clipped, current)
    if (distance < JND) {
      if (JND - distance < EPSILON) return { ...clipped, ...(origin.alpha !== undefined ? { alpha: origin.alpha } : {}) }
      minInGamut = false
      min = chroma
    } else {
      max = chroma
    }
  }
  const result = clipToGamut(current)
  return { ...result, ...(origin.alpha !== undefined ? { alpha: origin.alpha } : {}) }
}

/** Apply the user's chosen strategy. */
export function mapToGamut(color: Color, strategy: GamutStrategy, gamut: GamutId = 'srgb'): Oklch {
  switch (strategy) {
    case 'keep':
      return toOklch(color) as Oklch
    case 'clip':
      return isInGamut(color, gamut) ? (toOklch(color) as Oklch) : clipToGamut(color)
    case 'chroma-reduce':
      return isInGamut(color, gamut) ? (toOklch(color) as Oklch) : reduceChroma(color)
    case 'css4':
    default:
      return cssGamutMap(color, gamut)
  }
}

/**
 * The highest chroma that still fits in the gamut at this lightness and hue.
 * Used to draw the "gamut ceiling" on chroma sliders so users can see the
 * shape of the space they are working in.
 */
export function maxChroma(l: number, h: number, gamut: GamutId = 'srgb'): number {
  let lo = 0
  let hi = 0.5
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (isInGamut({ mode: 'oklch', l, c: mid, h }, gamut)) lo = mid
    else hi = mid
  }
  return lo
}

export const GAMUT_STRATEGY_LABELS: Record<GamutStrategy, string> = {
  css4: 'CSS Color 4 (recommended)',
  'chroma-reduce': 'Reduce chroma',
  clip: 'Clip channels',
  keep: 'Keep out-of-gamut',
}

export const GAMUT_STRATEGY_HINTS: Record<GamutStrategy, string> = {
  css4: 'The algorithm browsers themselves use. Binary-searches chroma down, but stops as soon as the difference becomes imperceptible (ΔEOK < 0.02). Keeps the most saturation while preserving hue and lightness.',
  'chroma-reduce': 'Lowers chroma until the color fits, holding lightness and hue exactly. Slightly duller than CSS Color 4 but completely predictable.',
  clip: 'Clamps each RGB channel to 0–1. Fastest, and the worst: it visibly shifts both hue and lightness. Included because some pipelines expect exactly this behaviour.',
  keep: 'Leaves the color as-is. Correct if you are targeting Display P3 or authoring in a wide-gamut pipeline — but hex and rgb() exports will still clip it.',
}
