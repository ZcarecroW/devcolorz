/**
 * Color harmony.
 *
 * Two things most tools get wrong and we do not:
 *
 * 1. Rotating hue in HSL gives lopsided results, because HSL hue is not
 *    perceptually even. We rotate in OKLCH by default.
 * 2. "Complementary" on the RGB wheel puts blue opposite yellow. Designers
 *    trained on the artist's wheel expect blue opposite orange. We support
 *    both wheels and default to the artistic one, because that is what people
 *    mean when they say complementary.
 */

import type { Oklch } from 'culori'
import { toOklch } from './convert'
import { mapToGamut, maxChroma } from './gamut'
import type { GamutStrategy, ColorInput } from './types'

export type HarmonyId =
  | 'complementary'
  | 'split-complementary'
  | 'analogous'
  | 'triadic'
  | 'tetradic'
  | 'square'
  | 'monochromatic'
  | 'shades'
  | 'tints'
  | 'tones'
  | 'compound'
  | 'double-split'
  | 'hue-wheel'

export type HueWheel = 'oklch' | 'ryb' | 'hsl'

export interface HarmonyOptions {
  /** Which wheel the hue rotations happen on. */
  wheel: HueWheel
  /** How many colors the result should contain. Harmonies that have a natural size clamp to it. */
  count: number
  /**
   * Degrees of separation, for the two schemes that have a separation to set:
   * the step between neighbours in `analogous`, and the distance of the
   * satellites from the complement in `split-complementary`. Every other
   * scheme has fixed geometry and ignores this.
   */
  angle: number
  /** Keep chroma and lightness of the seed, or vary them for a richer set. */
  vary: boolean
  gamut: GamutStrategy
}

export const DEFAULT_HARMONY_OPTIONS: HarmonyOptions = {
  wheel: 'ryb',
  count: 5,
  angle: 30,
  vary: true,
  gamut: 'css4',
}

/* ------------------------------------------------------------------ *
 * RYB wheel
 * ------------------------------------------------------------------ */

/**
 * Control points mapping the artistic (red–yellow–blue) wheel onto real hue
 * angles. On the RYB wheel red sits at 0°, yellow at 120°, blue at 240°;
 * in OKLCH those land at roughly 29°, 110° and 264°. Interpolating between
 * these anchors reproduces what designers expect: red's complement is green
 * on the RGB wheel but a warm green here, and blue's complement is orange.
 */
const RYB_ANCHORS: Array<[ryb: number, real: number]> = [
  [0, 29], // red
  [30, 44], // red-orange
  [60, 70], // orange
  [90, 90], // yellow-orange
  [120, 110], // yellow
  [150, 132], // yellow-green
  [180, 150], // green
  [210, 175], // blue-green
  [240, 264], // blue
  [270, 300], // blue-purple
  [300, 328], // purple
  [330, 348], // red-purple
  [360, 389], // back to red
]

function interpolateAnchors(value: number, from: 0 | 1, to: 0 | 1): number {
  let v = ((value % 360) + 360) % 360
  // The real-hue column starts at 29° (where red actually sits in OKLCH) and
  // runs past 360 to 389. Anything below the first anchor belongs to the final
  // wrapping segment, so lift it by a full turn before searching.
  const first = RYB_ANCHORS[0][from]
  if (v < first) v += 360
  for (let i = 0; i < RYB_ANCHORS.length - 1; i++) {
    const a = RYB_ANCHORS[i]
    const b = RYB_ANCHORS[i + 1]
    const lo = a[from]
    const hi = b[from]
    if (v >= lo && v <= hi) {
      const t = hi === lo ? 0 : (v - lo) / (hi - lo)
      const result = a[to] + t * (b[to] - a[to])
      return ((result % 360) + 360) % 360
    }
  }
  return v
}

/** Real OKLCH hue angle → position on the artistic wheel. */
export function toRybHue(hue: number): number {
  return interpolateAnchors(hue, 1, 0)
}

/** Position on the artistic wheel → real OKLCH hue angle. */
export function fromRybHue(hue: number): number {
  return interpolateAnchors(hue, 0, 1)
}

/** Rotate a hue by `degrees` on the chosen wheel, returning a real hue angle. */
export function rotateHue(hue: number, degrees: number, wheel: HueWheel): number {
  if (wheel === 'ryb') {
    return fromRybHue(toRybHue(hue) + degrees)
  }
  // OKLCH and HSL both rotate linearly; they differ only in which space the
  // caller's color already lives in, and ours always live in OKLCH.
  return ((hue + degrees) % 360 + 360) % 360
}

/* ------------------------------------------------------------------ *
 * Harmony generation
 * ------------------------------------------------------------------ */

const OFFSETS: Partial<Record<HarmonyId, number[]>> = {
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 60, 180, 240],
  square: [0, 90, 180, 270],
  'double-split': [0, 30, 180, 210],
  compound: [0, 30, 180, 210, 330],
}

function withHue(base: Oklch, hue: number): Oklch {
  return { ...base, h: ((hue % 360) + 360) % 360 }
}

/**
 * Nudge lightness and chroma so a harmony reads as a designed set rather than
 * five colors of identical weight. The pattern walks outward from the seed.
 */
function varyTone(color: Oklch, index: number, total: number): Oklch {
  if (total <= 1) return color
  const t = index / (total - 1)
  // Symmetric fan: middle keeps the seed's tone, ends move apart.
  const offset = (t - 0.5) * 2
  const l = Math.min(0.95, Math.max(0.15, (color.l ?? 0.5) + offset * 0.14))
  const ceiling = maxChroma(l, color.h ?? 0)
  const c = Math.min(ceiling, Math.max(0, (color.c ?? 0) * (1 - Math.abs(offset) * 0.18)))
  return { ...color, l, c }
}

/** Repeat/trim a hue offset list to exactly `count` entries. */
function fitOffsets(offsets: number[], count: number, spread: number): number[] {
  if (offsets.length === count) return offsets
  if (offsets.length > count) return offsets.slice(0, count)
  const out = offsets.slice()
  let i = 0
  while (out.length < count) {
    // Extra colors interleave between the canonical angles rather than
    // repeating them, so a triadic palette at count=6 stays balanced.
    const base = offsets[i % offsets.length]
    const next = offsets[(i + 1) % offsets.length]
    const gap = ((next - base) % 360 + 360) % 360 || spread
    out.push((base + gap / 2) % 360)
    i++
  }
  return out.slice(0, count)
}

export function harmony(seed: ColorInput, id: HarmonyId, options: Partial<HarmonyOptions> = {}): Oklch[] {
  const opts = { ...DEFAULT_HARMONY_OPTIONS, ...options }
  const base = toOklch(seed) as Oklch
  const hue = base.h ?? 0
  const count = Math.max(1, Math.round(opts.count))
  const finish = (colors: Oklch[]) => colors.map((c) => mapToGamut(c, opts.gamut))

  switch (id) {
    case 'analogous': {
      const step = opts.angle
      const start = -((count - 1) / 2) * step
      const colors = Array.from({ length: count }, (_, i) =>
        withHue(base, rotateHue(hue, start + i * step, opts.wheel)),
      )
      return finish(opts.vary ? colors.map((c, i) => varyTone(c, i, count)) : colors)
    }
    case 'hue-wheel': {
      const step = 360 / count
      const colors = Array.from({ length: count }, (_, i) =>
        withHue(base, rotateHue(hue, i * step, opts.wheel)),
      )
      return finish(colors)
    }
    case 'monochromatic': {
      // Even steps in perceptual lightness, chroma tapering at the extremes
      // because very light and very dark colors cannot hold much chroma.
      const colors = Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1)
        const l = 0.18 + t * 0.72
        const bell = 1 - Math.abs(t - 0.5) * 1.1
        const ceiling = maxChroma(l, hue)
        return { ...base, l, c: Math.min(ceiling, (base.c ?? 0.1) * Math.max(0.25, bell)) }
      })
      return finish(colors)
    }
    case 'shades': {
      // Toward black, holding hue.
      const colors = Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0 : i / (count - 1)
        const l = (base.l ?? 0.6) * (1 - t * 0.92)
        return { ...base, l, c: Math.min(maxChroma(l, hue), (base.c ?? 0.1) * (1 - t * 0.55)) }
      })
      return finish(colors)
    }
    case 'tints': {
      // Toward white, holding hue.
      const colors = Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0 : i / (count - 1)
        const l = (base.l ?? 0.6) + (1 - (base.l ?? 0.6)) * t * 0.94
        return { ...base, l, c: Math.min(maxChroma(l, hue), (base.c ?? 0.1) * (1 - t * 0.7)) }
      })
      return finish(colors)
    }
    case 'tones': {
      // Toward grey: chroma falls, lightness holds.
      const colors = Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0 : i / (count - 1)
        return { ...base, c: (base.c ?? 0.1) * (1 - t * 0.95) }
      })
      return finish(colors)
    }
    case 'split-complementary': {
      // The two satellites sit `angle` degrees either side of the complement,
      // so the spread control means something here as well as for analogous:
      // at 30 degrees this is the classic split, and near 90 it collapses
      // toward a plain complementary pair.
      const offsets = fitOffsets([0, 180 - opts.angle, 180 + opts.angle], count, opts.angle)
      const colors = offsets.map((offset) => withHue(base, rotateHue(hue, offset, opts.wheel)))
      return finish(opts.vary ? colors.map((c, i) => varyTone(c, i, colors.length)) : colors)
    }
    default: {
      const offsets = fitOffsets(OFFSETS[id] ?? [0, 180], count, opts.angle)
      const colors = offsets.map((offset) => withHue(base, rotateHue(hue, offset, opts.wheel)))
      return finish(opts.vary ? colors.map((c, i) => varyTone(c, i, colors.length)) : colors)
    }
  }
}

export const HARMONY_LABELS: Record<HarmonyId, string> = {
  complementary: 'Complementary',
  'split-complementary': 'Split complementary',
  analogous: 'Analogous',
  triadic: 'Triadic',
  tetradic: 'Tetradic',
  square: 'Square',
  'double-split': 'Double split',
  compound: 'Compound',
  monochromatic: 'Monochromatic',
  shades: 'Shades',
  tints: 'Tints',
  tones: 'Tones',
  'hue-wheel': 'Even hue wheel',
}

export const HARMONY_HINTS: Record<HarmonyId, string> = {
  complementary: 'The seed and the hue directly opposite it. Maximum contrast, high energy — and hard to use in quantity. Best as a small accent against a dominant color.',
  'split-complementary': 'The seed plus the two hues either side of its opposite. Keeps most of the tension of a complementary pair but is far more forgiving in layouts.',
  analogous: 'Neighbouring hues, evenly stepped. Naturally harmonious and calm; the step angle controls how adventurous it gets. Needs a lightness or chroma difference to stay legible.',
  triadic: 'Three hues evenly spaced around the wheel. Vibrant and balanced. Let one dominate and use the other two sparingly.',
  tetradic: 'Two complementary pairs forming a rectangle. Rich but demanding — pick one color to lead.',
  square: 'Four hues at 90° intervals. Like tetradic but perfectly even, so no hue family dominates by default.',
  'double-split': 'Two adjacent hues and their two opposites. A wider, more nuanced take on complementary.',
  compound: 'A complementary pair softened by the analogous neighbours of each. Contrast plus cohesion.',
  monochromatic: 'One hue at evenly spaced perceptual lightness steps, with chroma tapering at the extremes so the light and dark ends stay believable. The most reliably professional-looking option.',
  shades: 'The seed darkened toward black in even perceptual steps. Chroma is reduced as it darkens because deep colors cannot hold much of it.',
  tints: 'The seed lightened toward white. Useful for backgrounds and hover states derived from a brand color.',
  tones: 'The seed desaturated toward grey at constant lightness. Produces the muted, editorial palettes that pure hue rotations never find.',
  'hue-wheel': 'The full wheel divided evenly by the number of colors. The fastest way to a maximally distinct categorical set — think chart series.',
}

export const WHEEL_LABELS: Record<HueWheel, string> = {
  ryb: 'Artistic (RYB)',
  oklch: 'Perceptual (OKLCH)',
  hsl: 'Digital (HSL)',
}

export const WHEEL_HINTS: Record<HueWheel, string> = {
  ryb: 'The red–yellow–blue wheel taught in art school. Blue’s complement is orange, red’s is green. This is what most people mean by "complementary", so it is the default.',
  oklch: 'Rotations happen on the perceptual wheel, where equal angles look equally different. Mathematically the most even, but blue’s complement lands on yellow, which can feel wrong.',
  hsl: 'The raw RGB wheel used by hsl(). Fast and familiar, but its hues are unevenly spaced — the greens occupy a huge arc while the yellows are squeezed into a sliver.',
}

export const HARMONY_IDS = Object.keys(HARMONY_LABELS) as HarmonyId[]

/** The schemes whose geometry the spread control actually changes. */
export const ANGLE_HARMONIES: HarmonyId[] = ['analogous', 'split-complementary']
