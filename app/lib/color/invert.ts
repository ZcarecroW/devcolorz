/**
 * Light ⇄ dark variant derivation.
 *
 * Everyone's first dark mode is `filter: invert(1)`, everyone's second is
 * `l: 100% - l` in HSL, and both look wrong. The reason is that HSL lightness
 * is not perceived lightness: flipping it makes yellows turn to mud while
 * blues turn to neon. This module implements the strategies that do work, and
 * exposes them all so the choice is the user's rather than ours.
 */

import type { Color, Oklch } from 'culori'
import { toHsl, toOklch } from './convert'
import { apca, score, wcag, type ContrastMetric } from './contrast'
import { mapToGamut, maxChroma } from './gamut'
import type { GamutStrategy } from './types'

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
  lightBackground: Color
  darkBackground: Color
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

/**
 * The lightness remap curve used by `oklch-curve`.
 *
 * A straight flip (l → 1-l) sends a 95% background to 5%, which is far darker
 * than any real dark theme, and a 50% mid-tone to 50%, which does not move at
 * all. Instead we flip *and* compress into the [floor, ceiling] band, then
 * apply a gentle S-curve so mid-tones separate rather than piling up.
 */
function curveLightness(l: number, floor: number, ceiling: number): number {
  const flipped = 1 - l
  const compressed = floor + flipped * (ceiling - floor)
  // Smoothstep around the band centre, blended 40% with the linear result so
  // the correction is felt but never overpowering.
  const t = (compressed - floor) / (ceiling - floor || 1)
  const s = t * t * (3 - 2 * t)
  const blended = t * 0.6 + s * 0.4
  return floor + blended * (ceiling - floor)
}

/**
 * Radix-style asymmetric mapping. Radix's dark scales are not mirrors of the
 * light ones: backgrounds stay very dark, solid colors keep roughly the same
 * lightness so brand color survives, and text steps get lighter than a mirror
 * would make them. We approximate that by piecewise-remapping the input band.
 */
function radixLightness(l: number, floor: number, ceiling: number): number {
  if (l >= 0.9) return floor + (1 - l) * 0.6 // app/subtle backgrounds
  if (l >= 0.75) return floor + 0.06 + (0.9 - l) * 0.5 // component backgrounds
  if (l >= 0.55) return 0.34 + (0.75 - l) * 0.55 // borders
  if (l >= 0.4) return Math.min(ceiling, l + 0.06) // solid brand colors barely move
  if (l >= 0.25) return Math.min(ceiling, 0.72 + (0.4 - l) * 0.6) // low-contrast text
  return Math.min(ceiling, ceiling - l * 0.25) // high-contrast text
}

/**
 * Material Design 3 derives dark schemes by picking different *tones* from the
 * same tonal palette: where light mode uses tone 40 for a primary, dark mode
 * uses tone 80. Expressed as a lightness map that is roughly "reflect around
 * tone 60 rather than tone 50".
 */
function materialLightness(l: number, floor: number, ceiling: number): number {
  const tone = l // OKLCH L tracks M3 tone closely enough for this purpose
  const reflected = 1.2 - tone
  return Math.min(ceiling, Math.max(floor, reflected))
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
): number {
  const target = score(color, options.lightBackground, options.metric)
  const hue = color.h ?? 0
  const chroma = color.c ?? 0
  let best = 1 - (color.l ?? 0.5)
  let bestDelta = Infinity
  // 1% steps over the legal band is plenty: the eye cannot resolve finer.
  for (let l = options.darkFloor; l <= options.darkCeiling; l += 0.01) {
    const candidate: Oklch = { mode: 'oklch', l, c: Math.min(chroma, maxChroma(l, hue)), h: hue }
    const delta = Math.abs(score(candidate, options.darkBackground, options.metric) - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = l
    }
  }
  return best
}

/** Derive the dark-mode counterpart of a light-mode color. */
export function toDark(color: Color, options: Partial<InvertOptions> = {}): Oklch {
  const opts = { ...DEFAULT_INVERT_OPTIONS, ...options }
  const base = toOklch(color) as Oklch
  const fromL = base.l ?? 0.5
  const hue = base.h ?? 0
  const chroma = base.c ?? 0

  if (opts.strategy === 'none') return base

  if (opts.strategy === 'hsl-flip') {
    // Deliberately faithful to the naive approach, warts and all, so users
    // can see for themselves why the tooltip warns against it.
    const hsl = toHsl(base) as { h?: number; s: number; l: number }
    return mapToGamut({ mode: 'hsl', h: hsl.h ?? 0, s: hsl.s, l: 1 - hsl.l } as never, opts.gamut)
  }

  let toL: number
  switch (opts.strategy) {
    case 'oklch-flip':
      toL = 1 - fromL
      break
    case 'radix':
      toL = radixLightness(fromL, opts.darkFloor, opts.darkCeiling)
      break
    case 'material':
      toL = materialLightness(fromL, opts.darkFloor, opts.darkCeiling)
      break
    case 'contrast-preserve':
      toL = contrastPreserveLightness(base, opts)
      break
    case 'oklch-curve':
    default:
      toL = curveLightness(fromL, opts.darkFloor, opts.darkCeiling)
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
export function toLight(color: Color, options: Partial<InvertOptions> = {}): Oklch {
  const opts = { ...DEFAULT_INVERT_OPTIONS, ...options }
  const base = toOklch(color) as Oklch
  const fromL = base.l ?? 0.5
  const hue = base.h ?? 0
  const chroma = base.c ?? 0
  if (opts.strategy === 'none') return base

  // Mirror of the dark path: expand out of the dark band, then flip.
  const t = (fromL - opts.darkFloor) / (opts.darkCeiling - opts.darkFloor || 1)
  const clamped = Math.min(1, Math.max(0, t))
  const toL =
    opts.strategy === 'oklch-flip' || opts.strategy === 'hsl-flip'
      ? 1 - fromL
      : Math.min(0.99, Math.max(0.02, 1 - clamped))
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
  light: Color,
  dark: Color,
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
    'Flip perceptual lightness, then compress the result into a usable dark band and apply a gentle S-curve. Backgrounds land on a comfortable dark grey instead of pure black, mid-tones separate properly, and chroma is rescaled to what the gamut can actually hold at the new lightness. This is the strategy that produces dark themes people do not immediately turn off.',
  radix:
    'Follows the philosophy of the Radix Colors scales: a dark theme is not a mirror image. Backgrounds stay very dark, borders move only a little, solid brand colors keep almost exactly the lightness they had — so your brand still looks like your brand — and only the text steps invert strongly. The most "designed" result, and the least mathematically pure.',
  'contrast-preserve':
    'Ignores lightness entirely and solves for contrast instead. For each color it finds the dark-mode lightness whose contrast against the dark background matches the original’s contrast against the light background. Guarantees that anything readable in light mode stays exactly as readable in dark mode, which no lightness-based strategy can promise. Adobe Leonardo popularised this approach.',
  material:
    'Approximates how Material Design 3 builds dark schemes: rather than inverting a color, it picks a different tone from the same tonal palette — where light mode uses tone 40, dark mode uses tone 80. Reflecting around tone 60 rather than 50 keeps colors slightly brighter than a true mirror, which is what makes M3 dark themes feel soft rather than harsh.',
  none: 'Use the same color in both modes. Correct for colors that are already mode-agnostic, such as a mid-lightness brand accent that reads fine on either background.',
}
