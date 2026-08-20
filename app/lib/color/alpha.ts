/**
 * Transparent variants.
 *
 * Two different things get called "alpha colors" and the difference matters:
 *
 * 1. A simple opacity ladder — the same color at 10%, 20%, 30%. Easy, and
 *    what most tools mean.
 * 2. A *solved* alpha color — the pair of (color, alpha) that composites to a
 *    known target over a known background. This is how Radix builds its alpha
 *    scales, and it is what you actually want for overlays, hover states and
 *    borders, because the result stays correct when the surface behind it is
 *    an image or a gradient instead of a flat fill.
 */

import type { Color, Oklch, Rgb } from 'culori'
import { toOklch, toRgb } from './convert'
import { deltaEOK } from './gamut'

/** Default opacity ladder, matching the steps designers actually reach for. */
export const DEFAULT_ALPHA_STEPS = [0.03, 0.06, 0.09, 0.12, 0.16, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9]

export interface AlphaVariant {
  alpha: number
  color: Oklch
  /** Label used when naming the exported variable, e.g. `12` for 12%. */
  step: string
}

/** The simple ladder: one color, many opacities. */
export function alphaLadder(color: Color, steps: number[] = DEFAULT_ALPHA_STEPS): AlphaVariant[] {
  const base = toOklch(color) as Oklch
  return steps.map((alpha) => ({
    alpha,
    color: { ...base, alpha },
    step: String(Math.round(alpha * 100)),
  }))
}

/** Composite `fg` (with alpha) over `bg`, in gamma-encoded sRGB as browsers do. */
export function composite(fg: Color, bg: Color): Oklch {
  const f = toRgb(fg) as Rgb
  const b = toRgb(bg) as Rgb
  const a = f.alpha ?? 1
  return toOklch({
    mode: 'rgb',
    r: f.r * a + b.r * (1 - a),
    g: f.g * a + b.g * (1 - a),
    b: f.b * a + b.b * (1 - a),
  }) as Oklch

}

export interface SolvedAlpha {
  /** The color to put in the CSS, already carrying its alpha. */
  color: Oklch
  alpha: number
  /** How closely it reproduces the target, as ΔEOK × 100. Under 1 is exact. */
  error: number
  /** False when no (color, alpha) pair can reach the target over this background. */
  exact: boolean
}

/**
 * Find the lowest-alpha color that composites to `target` over `background`.
 *
 * Solving per channel: target = α·C + (1−α)·BG, so C = (target − (1−α)·BG) / α.
 * C must stay in [0, 1], which sets a floor on α for each channel; the largest
 * of those floors is the answer, and it is the *minimum* alpha that works —
 * exactly what you want, since a lower alpha adapts better to varied surfaces.
 */
export function solveAlpha(target: Color, background: Color): SolvedAlpha {
  const t = toRgb(target) as Rgb
  const bg = toRgb(background) as Rgb
  const channels: Array<[number, number]> = [
    [t.r, bg.r],
    [t.g, bg.g],
    [t.b, bg.b],
  ]

  let alpha = 0
  for (const [tv, bv] of channels) {
    const clampedT = Math.min(1, Math.max(0, tv))
    const clampedB = Math.min(1, Math.max(0, bv))
    if (Math.abs(clampedT - clampedB) < 1e-6) continue
    const required =
      clampedT > clampedB
        ? (clampedT - clampedB) / (1 - clampedB || 1e-6)
        : (clampedB - clampedT) / (clampedB || 1e-6)
    if (required > alpha) alpha = required
  }
  alpha = Math.min(1, Math.max(0.0001, alpha))

  const solve = (tv: number, bv: number) =>
    Math.min(1, Math.max(0, (tv - (1 - alpha) * bv) / alpha))
  const color = toOklch({
    mode: 'rgb',
    r: solve(t.r, bg.r),
    g: solve(t.g, bg.g),
    b: solve(t.b, bg.b),
    alpha,
  }) as Oklch

  const achieved = composite(color, background)
  const error = deltaEOK(achieved, target) * 100
  return { color, alpha, error, exact: error < 1 }
}

/**
 * Build an alpha scale that reproduces a set of solid steps over a background —
 * the Radix approach. Feed it a tonal scale and its light background and you
 * get overlay-safe equivalents of every step.
 */
export function alphaScaleFrom(steps: Color[], background: Color): SolvedAlpha[] {
  return steps.map((step) => solveAlpha(step, background))
}

/**
 * Neutral overlay ladder — black over light surfaces, white over dark ones.
 * The everyday case for scrims, hover fills and dividers.
 */
export function overlayLadder(background: Color, steps: number[] = DEFAULT_ALPHA_STEPS): AlphaVariant[] {
  const bg = toOklch(background) as Oklch
  const dark = (bg.l ?? 1) < 0.5
  const base: Oklch = { mode: 'oklch', l: dark ? 1 : 0, c: 0, h: 0 }
  return steps.map((alpha) => ({
    alpha,
    color: { ...base, alpha },
    step: String(Math.round(alpha * 100)),
  }))
}

export const ALPHA_MODE_HINTS = {
  ladder:
    'The straightforward option: your color at a series of opacities. Predictable, and what most people expect from "transparent variants". The catch is that the result depends on whatever sits behind it, so the same variable looks different on white than on a photo.',
  solved:
    'Solves for the pair of colour and opacity that composites to a specific target over a specific background. The exported value looks nothing like your original color — that is the point. Because it is genuinely translucent, it stays correct over gradients, images and nested surfaces, where a flat opacity ladder drifts. This is how Radix builds its alpha scales.',
  overlay:
    'Pure black or pure white at a series of opacities, chosen automatically to suit the background’s lightness. The right tool for scrims, hover fills, dividers and disabled states — anywhere the tint should come from the surface rather than from the brand.',
} as const
