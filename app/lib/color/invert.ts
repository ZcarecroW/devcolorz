/**
 * Light ⇄ dark variant derivation.
 *
 * Everyone's first dark mode is `filter: invert(1)`, everyone's second is
 * `l: 100% - l` in HSL, and both look wrong. The reason is that HSL lightness
 * is not perceived lightness: flipping it makes yellows turn to mud while
 * blues turn to neon. This module implements the strategies that do work, and
 * exposes them all so the choice is the user's rather than ours.
 */

import type { Oklch } from 'culori'
import { toHsl, toOklch } from './convert'
import { apca, score, wcag, type ContrastMetric } from './contrast'
import { mapToGamut, maxChroma } from './gamut'
import type { GamutStrategy, ColorInput } from './types'

export type InvertStrategy =
  | 'hsl-flip'
  | 'oklch-flip'
  | 'oklch-curve'
  | 'radix'
  | 'contrast-preserve'
  | 'material'
  | 'none'

export interface InvertOptions {
  strategy: InvertStrategy
  /**
   * Lightness the darkest colors are allowed to reach in dark mode.
   * Pure black backgrounds cause halation on OLED, so the floor defaults
   * above zero.
   */
  darkFloor: number
  /** Lightness the lightest colors are allowed to reach in dark mode. */
  darkCeiling: number
  /**
   * How much chroma is rescaled when lightness moves. Dark surfaces hold
   * less chroma before looking dirty; 0 keeps chroma untouched, 1 rescales
   * fully to the gamut ceiling at the new lightness.
   */
  chromaCompensation: number
  /**
   * Dark UI usually needs slightly *more* chroma in accents to feel as
   * saturated, because the surround is dark. This nudges accents up.
   */
  accentBoost: number
  /** The background each mode composites against, used by contrast-preserve. */
  lightBackground: ColorInput
  darkBackground: ColorInput
  metric: ContrastMetric
  gamut: GamutStrategy
}

export const DEFAULT_INVERT_OPTIONS: InvertOptions = {
  strategy: 'oklch-curve',
  darkFloor: 0.14,
  darkCeiling: 0.93,
  chromaCompensation: 0.55,
  accentBoost: 0.06,
  lightBackground: { mode: 'oklch', l: 1, c: 0, h: 0 } as Oklch,
  darkBackground: { mode: 'oklch', l: 0.145, c: 0, h: 0 } as Oklch,
  metric: 'apca',
  gamut: 'css4',
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

/**
 * The lightness remap used by `oklch-curve`.
 *
 * A straight flip is wrong, and it is wrong in two different ways depending on
 * what the colour is for — which is why this function looks at chroma as well
 * as at lightness.
 *
 * A **surface** is near-neutral, and flipping it is exactly right: a 98% page
 * background should become a dark page background, and near-black body text
 * should become near-white. Compressing the flip into the [floor, ceiling]
 * band is what stops the background landing on pure black, which causes
 * halation on OLED.
 *
 * An **accent** is chromatic, and flipping it is a disaster. A brand green at
 * 56% lightness reads well on white; flip it to 44% and on a dark background
 * it reaches about Lc 20 — far below the Lc 45 a button needs to be visible at
 * all. Real design systems do not flip accents. Radix keeps its solid step at
 * roughly the same lightness so the brand survives, and Material moves a
 * primary from tone 40 to tone 80. Both move accents *up*.
 *
 * So the two treatments are computed separately and blended by how chromatic
 * the colour is: a neutral gets the flip, a saturated accent gets lifted into
 * the band where it reads against a dark surface, and the tinted greys in
 * between get a proportionate mix.
 */
function curveLightness(l: number, chroma: number, floor: number, ceiling: number): number {
  // Surfaces and ink: flip into the usable dark band.
  const surface = floor + (1 - l) * (ceiling - floor)

  /*
   * Accents: land between 62% and 88% at the default band, darker originals
   * lifted further, so the result reads on a dark background while preserving
   * the palette's ordering.
   *
   * Expressed as a fraction of the legal band rather than as fixed numbers.
   * Both bounds are user-controlled, and at a ceiling of 0.8 — which the
   * export panel offers — the fixed band ran past it, so `Math.min(ceiling, …)`
   * flattened the top of the ramp onto one value and reversed the order of the
   * steps just below it. At the default floor and ceiling this reproduces
   * 0.62–0.88 exactly.
   */
  const span = ceiling - floor
  const accentLow = floor + 0.60759 * span
  const accentHigh = floor + 0.93671 * span
  const accent = accentLow + (1 - l) * (accentHigh - accentLow)

  // 0.03 is about where a colour stops looking like a tinted grey; by 0.10 it
  // is unambiguously an accent.
  const chromatic = smoothstep(0.03, 0.1, chroma)
  const mixed = surface * (1 - chromatic) + accent * chromatic
  return Math.min(ceiling, Math.max(floor, mixed))
}

/**
 * Radix-style asymmetric mapping. Radix's dark scales are not mirrors of the
 * light ones: backgrounds stay very dark, solid colors keep roughly the same
 * lightness so brand color survives, and text steps get lighter than a mirror
 * would make them. We approximate that by piecewise-remapping the input band.
 */
function radixLightness(l: number, floor: number, ceiling: number): number {
  /*
   * The bands are chained through shared anchors so each one starts exactly
   * where the previous one ended. Written as independent formulas they did not
   * meet: the borders band ended at 0.45 while the solid band restarted at
   * `l + 0.06` = 0.61, a 0.155 jump at L 0.55 that reversed the order of the
   * ramp. A light 600 and a light 700 came back with 700 the *lighter* of the
   * two, so a hover state built as "600 idle, 700 pressed" got brighter on
   * press. Monotonically non-increasing in `l`, which is what makes a
   * descending light ramp produce an ascending dark one.
   *
   * The anchors are fractions of the band, not fixed numbers. Both bounds are
   * user-controlled — the export panel's floor reaches 0.4 and its ceiling
   * bottoms out at 0.6 — and fixed anchors clamped into that window landed on
   * top of each other: at a floor of 0.4 and a ceiling of 0.6, eight light
   * inputs between 0.4 and 0.75 came out at one dark value, so four
   * consecutive Tailwind steps were the same colour. Strictly increasing
   * fractions cannot coincide however narrow the band is, and at the default
   * floor and ceiling they reproduce the old anchors — 0.20, 0.275, 0.45,
   * 0.50 and 0.72 — exactly.
   */
  const top = Math.max(floor, ceiling)
  const span = top - floor
  const a90 = floor + 0.07595 * span // where the background band ends
  const a75 = floor + 0.17089 * span // component backgrounds
  const a55 = floor + 0.39241 * span // borders
  const a40 = floor + 0.4557 * span // solid brand: nearly flat
  const a25 = floor + 0.73418 * span // low-contrast text

  if (l >= 0.9) return floor + (1 - l) * ((a90 - floor) / 0.1)
  if (l >= 0.75) return a90 + (0.9 - l) * ((a75 - a90) / 0.15)
  if (l >= 0.55) return a75 + (0.75 - l) * ((a55 - a75) / 0.2)
  if (l >= 0.4) return a55 + (0.55 - l) * ((a40 - a55) / 0.15)
  if (l >= 0.25) return a40 + (0.4 - l) * ((a25 - a40) / 0.15)
  return a25 + (0.25 - l) * ((top - a25) / 0.25)
}

/**
 * Material Design 3 derives dark schemes by picking different *tones* from the
 * same tonal palette: where light mode uses tone 40 for a primary, dark mode
 * uses tone 80. Expressed as a lightness map that is roughly "reflect around
 * tone 60 rather than tone 50".
 */
function materialLightness(l: number, floor: number, ceiling: number): number {
  /*
   * Reflecting around tone 60 is the M3 idea, but `1.2 - l` leaves the legal
   * band for every tone below 0.27, and clamping there mapped a quarter of the
   * input range onto one output value: a near-black surface and a dark slate
   * came out as the same near-white, so the surface and the thing standing on
   * it merged. Flip into the band, then lift the middle. The lift is zero at
   * both ends, so white still reaches the floor and black the ceiling, and
   * since 1 + 0.16π·cos(πt) ≥ 0.497 the map stays strictly monotone — two
   * distinct inputs can never collapse onto one output again.
   */
  const t = 1 - l
  const lifted = t + 0.16 * Math.sin(Math.PI * t)
  return floor + Math.min(1, Math.max(0, lifted)) * (ceiling - floor)
}

/**
 * Rescale chroma for a new lightness.
 *
 * At `amount` 1 the color keeps the same *fraction* of the available chroma
 * it had before, which is what stops light pastels from becoming neon when
 * they move into the dark band.
 */
function adaptChroma(chroma: number, hue: number, fromL: number, toL: number, amount: number): number {
  if (amount <= 0) return Math.min(chroma, maxChroma(toL, hue))
  const ceilingFrom = maxChroma(fromL, hue)
  const ceilingTo = maxChroma(toL, hue)
  if (ceilingFrom <= 0) return 0
  const fraction = Math.min(1, chroma / ceilingFrom)
  const rescaled = fraction * ceilingTo
  const blended = chroma * (1 - amount) + rescaled * amount
  return Math.min(blended, ceilingTo)
}

/**
 * Solve for the lightness whose contrast against the dark background matches
 * the original's contrast against the light background.
 *
 * This is Adobe Leonardo's idea: contrast, not lightness, is the invariant
 * worth preserving. It is the only strategy here that guarantees a color which
 * was readable in light mode is equally readable in dark mode.
 */
function contrastPreserveLightness(
  color: Oklch,
  options: InvertOptions,
  floor: number,
  ceiling: number,
): number {
  const target = score(color, options.lightBackground, options.metric)
  const hue = color.h ?? 0
  const chroma = color.c ?? 0
  let best = 1 - (color.l ?? 0.5)
  let bestDelta = Infinity
  // 1% steps over the legal band is plenty: the eye cannot resolve finer.
  for (let l = floor; l <= ceiling + 1e-9; l += 0.01) {
    const candidate: Oklch = { mode: 'oklch', l, c: Math.min(chroma, maxChroma(l, hue)), h: hue }
    const delta = Math.abs(score(candidate, options.darkBackground, options.metric) - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = l
    }
  }
  return best
}

/**
 * The dark band, in order.
 *
 * The floor and the ceiling are two independent inputs, so nothing stops a
 * caller handing them over crossed. Every strategy loops or clamps between
 * them, and with the bounds reversed the contrast solver ran zero iterations
 * and quietly returned the naive flip it had been asked to improve on.
 */
function band(options: InvertOptions): [floor: number, ceiling: number] {
  const lo = Math.min(options.darkFloor, options.darkCeiling)
  const hi = Math.max(options.darkFloor, options.darkCeiling)
  return [Math.min(1, Math.max(0, lo)), Math.min(1, Math.max(0, hi))]
}

/** The naive HSL flip, warts and all, so it can be compared with the rest. */
function hslFlip(base: Oklch, gamut: GamutStrategy): Oklch {
  const hsl = toHsl(base) as { h?: number; s: number; l: number }
  return mapToGamut({ mode: 'hsl', h: hsl.h ?? 0, s: hsl.s, l: 1 - hsl.l } as never, gamut)
}

/** Derive the dark-mode counterpart of a light-mode color. */
export function toDark(color: ColorInput, options: Partial<InvertOptions> = {}): Oklch {
  const opts = { ...DEFAULT_INVERT_OPTIONS, ...options }
  const base = toOklch(color) as Oklch
  const fromL = base.l ?? 0.5
  const hue = base.h ?? 0
  const chroma = base.c ?? 0

  if (opts.strategy === 'none') return base

  if (opts.strategy === 'hsl-flip') {
    // Deliberately faithful to the naive approach so users can see for
    // themselves why the tooltip warns against it.
    return hslFlip(base, opts.gamut)
  }

  const [floor, ceiling] = band(opts)
  let toL: number
  switch (opts.strategy) {
    case 'oklch-flip':
      toL = 1 - fromL
      break
    case 'radix':
      toL = radixLightness(fromL, floor, ceiling)
      break
    case 'material':
      toL = materialLightness(fromL, floor, ceiling)
      break
    case 'contrast-preserve':
      toL = contrastPreserveLightness(base, opts, floor, ceiling)
      break
    case 'oklch-curve':
    default:
      toL = curveLightness(fromL, chroma, floor, ceiling)
      break
  }
  toL = Math.min(1, Math.max(0, toL))

  let toC = adaptChroma(chroma, hue, fromL, toL, opts.chromaCompensation)
  // Accents — colorful, mid-lightness colors — get the surround boost.
  if (chroma > 0.05 && toL > 0.3 && toL < 0.85) {
    toC = Math.min(maxChroma(toL, hue), toC + opts.accentBoost * chroma)
  }

  return mapToGamut(
    { mode: 'oklch', l: toL, c: toC, h: hue, ...(base.alpha !== undefined ? { alpha: base.alpha } : {}) },
    opts.gamut,
  )
}

/** The inverse trip, for palettes authored dark-first. */
export function toLight(color: ColorInput, options: Partial<InvertOptions> = {}): Oklch {
  const opts = { ...DEFAULT_INVERT_OPTIONS, ...options }
  const base = toOklch(color) as Oklch
  const fromL = base.l ?? 0.5
  const hue = base.h ?? 0
  const chroma = base.c ?? 0
  if (opts.strategy === 'none') return base
  // The same naive flip in both directions: it used to be an HSL flip going
  // dark and an OKLCH flip coming back, so one named strategy was two
  // different algorithms depending on which way it was asked.
  if (opts.strategy === 'hsl-flip') return hslFlip(base, opts.gamut)

  // Mirror of the dark path: expand out of the dark band, then flip.
  const [floor, ceiling] = band(opts)
  const t = (fromL - floor) / (ceiling - floor || 1)
  const clamped = Math.min(1, Math.max(0, t))
  const toL =
    opts.strategy === 'oklch-flip' ? 1 - fromL : Math.min(0.99, Math.max(0.02, 1 - clamped))
  const toC = adaptChroma(chroma, hue, fromL, toL, opts.chromaCompensation)
  return mapToGamut({ mode: 'oklch', l: toL, c: toC, h: hue }, opts.gamut)
}

/** Report how much a strategy changed a color's readability. */
export interface InvertReport {
  lightRatio: number
  darkRatio: number
  lightLc: number
  darkLc: number
  /** Absolute difference in APCA Lc — under 10 is a faithful translation. */
  drift: number
}

export function reportInversion(
  light: ColorInput,
  dark: ColorInput,
  options: Partial<InvertOptions> = {},
): InvertReport {
  const opts = { ...DEFAULT_INVERT_OPTIONS, ...options }
  const lightLc = apca(light, opts.lightBackground)
  const darkLc = apca(dark, opts.darkBackground)
  return {
    lightRatio: wcag(light, opts.lightBackground),
    darkRatio: wcag(dark, opts.darkBackground),
    lightLc,
    darkLc,
    drift: Math.abs(Math.abs(lightLc) - Math.abs(darkLc)),
  }
}

export const INVERT_LABELS: Record<InvertStrategy, string> = {
  'oklch-curve': 'OKLCH curve (recommended)',
  'contrast-preserve': 'Preserve contrast',
  radix: 'Radix-style asymmetric',
  material: 'Material 3 tonal',
  'oklch-flip': 'OKLCH flip',
  'hsl-flip': 'HSL flip (naive)',
  none: 'No inversion',
}

export const INVERT_HINTS: Record<InvertStrategy, string> = {
  'hsl-flip':
    'The classic mistake: take the HSL lightness and subtract it from 100%. Because HSL lightness has nothing to do with perceived lightness, the result is uneven — a yellow at 50% and a blue at 50% look nothing alike, so flipping both by the same amount moves one far more than the other. It also sends a 96% background to 4%, which is darker than any real dark theme. Shown here so you can compare, not because you should use it.',
  'oklch-flip':
    'Flip perceptual lightness: L becomes 1−L. Much better than the HSL version because the flip now means the same thing for every hue. Its remaining flaw is range — a near-white surface becomes near-black, and mid-tones do not move at all, so the palette loses its internal hierarchy.',
  'oklch-curve':
    'Treats surfaces and accents differently, because flipping is right for one and ruinous for the other. Near-neutral colors — page backgrounds, body text — are flipped into a comfortable dark band that stops short of pure black. Chromatic colors are lifted instead: a brand green at 56% lightness reads well on white, but flipped to 44% it nearly disappears against a dark background, so it is raised into the range where it still reads. Radix and Material both do a version of this, and it is what produces a dark theme people do not immediately switch off.',
  radix:
    'Follows the philosophy of the Radix Colors scales: a dark theme is not a mirror image. Backgrounds stay very dark, borders move only a little, solid brand colors keep almost exactly the lightness they had — so your brand still looks like your brand — and only the text steps invert strongly. The most "designed" result, and the least mathematically pure.',
  'contrast-preserve':
    'Ignores lightness entirely and solves for contrast instead. For each color it finds the dark-mode lightness whose contrast against the dark background matches the original’s contrast against the light background. Guarantees that anything readable in light mode stays exactly as readable in dark mode, which no lightness-based strategy can promise. Adobe Leonardo popularised this approach.',
  material:
    'Approximates how Material Design 3 builds dark schemes: rather than inverting a color, it picks a different tone from the same tonal palette — where light mode uses tone 40, dark mode uses tone 80. Reflecting around tone 60 rather than 50 keeps colors slightly brighter than a true mirror, which is what makes M3 dark themes feel soft rather than harsh.',
  none: 'Use the same color in both modes. Correct for colors that are already mode-agnostic, such as a mid-lightness brand accent that reads fine on either background.',
}
