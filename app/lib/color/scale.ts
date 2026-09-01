/**
 * Tonal scales — turning one color into the 11-or-12 step ramp a real design
 * system needs.
 *
 * Three generation modes, because the right answer depends on what the scale
 * is for:
 *   • `lightness` — even perceptual steps. Best-looking ramps, no contrast
 *     guarantees.
 *   • `contrast`  — solve each step for a target contrast against the surface.
 *     Guarantees accessibility, at the cost of uneven-looking steps.
 *   • `hybrid`    — even steps, then nudged until they clear their targets.
 */

import type { Oklch } from 'culori'
import { toOklch } from './convert'
import { score, type ContrastMetric } from './contrast'
import { mapToGamut, maxChroma } from './gamut'
import type { GamutStrategy, ColorInput } from './types'

export type ScalePreset = 'tailwind' | 'radix' | 'material' | 'custom'
export type ScaleMode = 'lightness' | 'contrast' | 'hybrid'

export interface ScaleStop {
  /** The name this step gets in exports: `50`, `500`, `950`, or `1`…`12`. */
  key: string
  color: Oklch
  /** Contrast against the scale's reference surface, in the active metric. */
  contrast: number
  /** True when the step meets its accessibility target. */
  meetsTarget: boolean
  /** What this step is meant for, shown in the UI. */
  purpose: string
}

export interface ScaleOptions {
  preset: ScalePreset
  mode: ScaleMode
  /** Number of steps when `preset` is `custom`. */
  steps: number
  /** Lightness of the lightest step. */
  lightEnd: number
  /** Lightness of the darkest step. */
  darkEnd: number
  /**
   * Where the seed color sits in the ramp, 0–1. 0.5 keeps it in the middle;
   * lower values treat the seed as a light tint, higher as a dark shade.
   */
  anchor: number | null
  /** Chroma at the ends relative to the middle. Below 1 desaturates the tails. */
  chromaFalloff: number
  /**
   * Bend the lightness distribution. The ramp interpolates `pow(t, curve)`
   * from `lightEnd` to `darkEnd`, so values below 1 push the steps toward the
   * dark end and values above 1 keep more of them light.
   */
  curve: number
  /** Surface the contrast targets are measured against. */
  background: ColorInput
  metric: ContrastMetric
  /** Target contrast per step, used by `contrast` and `hybrid`. */
  targets: number[] | null
  gamut: GamutStrategy
  /** Preserve the seed color exactly at its anchor step. */
  pinSeed: boolean
}

export const TAILWIND_KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
export const RADIX_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
/*
 * Material tones count *up* toward white: tone 0 is black, tone 100 is white.
 * The ramp itself is generated light-to-dark like every other preset, so the
 * key list has to descend — listed the other way round, the step labelled 0
 * came out near-white and `tone 40`, the canonical M3 light-mode primary,
 * handed back a pale tint.
 */
export const MATERIAL_KEYS = ['100', '99', '95', '90', '80', '70', '60', '50', '40', '30', '20', '10', '0']

/** What each Radix step is contractually for — the reason the scale is useful. */
export const RADIX_PURPOSES: Record<string, string> = {
  '1': 'App background',
  '2': 'Subtle background',
  '3': 'Component background',
  '4': 'Hovered component background',
  '5': 'Active / selected component background',
  '6': 'Subtle border, separator',
  '7': 'Border, focus ring',
  '8': 'Hovered border, strong separator',
  '9': 'Solid background — the brand color itself',
  '10': 'Hovered solid background',
  '11': 'Low-contrast text',
  '12': 'High-contrast text',
}

export const TAILWIND_PURPOSES: Record<string, string> = {
  '50': 'Faintest tint — page and panel backgrounds',
  '100': 'Subtle fills, hovered rows',
  '200': 'Borders and dividers on light surfaces',
  '300': 'Disabled text, decorative strokes',
  '400': 'Placeholder text, icons on light surfaces',
  '500': 'The base color — default buttons and links',
  '600': 'Hovered buttons, links on white',
  '700': 'Pressed states, headings',
  '800': 'Text on tinted backgrounds',
  '900': 'Highest-contrast text',
  '950': 'Dark-mode surfaces',
}

export const DEFAULT_SCALE_OPTIONS: ScaleOptions = {
  preset: 'tailwind',
  mode: 'lightness',
  steps: 11,
  lightEnd: 0.972,
  darkEnd: 0.19,
  anchor: null,
  chromaFalloff: 0.55,
  curve: 1,
  background: { mode: 'oklch', l: 1, c: 0, h: 0 } as Oklch,
  metric: 'wcag',
  targets: null,
  gamut: 'css4',
  pinSeed: true,
}

/** WCAG ratios that a Tailwind-shaped scale should hit against white. */
export const TAILWIND_CONTRAST_TARGETS = [1.05, 1.12, 1.35, 1.8, 2.6, 3.9, 5.4, 7.5, 10.6, 14.2, 17.5]
/** WCAG ratios matching the Radix step contract against a light app background. */
export const RADIX_CONTRAST_TARGETS = [1.02, 1.06, 1.14, 1.24, 1.38, 1.6, 1.9, 2.4, 3.3, 3.9, 5.6, 13.5]

/**
 * The same ladders in APCA Lc.
 *
 * A separate table is not a nicety. WCAG ratios run 1–21 and APCA Lc runs
 * 0–106, so scoring an APCA scale against the WCAG ladder marks essentially
 * every step as passing and the badge stops carrying information. These are
 * the Lc values the corresponding steps should reach against the reference
 * surface: 60 is the floor for large or heavy text, 75 for body text, 90 for
 * body text at any weight.
 */
export const TAILWIND_APCA_TARGETS = [3, 7, 18, 30, 45, 60, 72, 85, 95, 103, 106]
export const RADIX_APCA_TARGETS = [1, 3, 7, 11, 16, 23, 30, 40, 55, 62, 75, 95]

function keysFor(options: ScaleOptions): string[] {
  switch (options.preset) {
    case 'radix':
      return RADIX_KEYS
    case 'material':
      return MATERIAL_KEYS
    case 'tailwind':
      return TAILWIND_KEYS
    default:
      return Array.from({ length: Math.max(2, options.steps) }, (_, i) => String((i + 1) * 100))
  }
}

function purposesFor(preset: ScalePreset): Record<string, string> {
  if (preset === 'radix') return RADIX_PURPOSES
  if (preset === 'tailwind') return TAILWIND_PURPOSES
  return {}
}

function targetsFor(options: ScaleOptions, count: number): number[] {
  if (options.targets && options.targets.length === count) return options.targets
  const apca = options.metric === 'apca'
  const source = options.preset === 'radix'
    ? (apca ? RADIX_APCA_TARGETS : RADIX_CONTRAST_TARGETS)
    : (apca ? TAILWIND_APCA_TARGETS : TAILWIND_CONTRAST_TARGETS)
  // Resample whichever canonical target list we have onto `count` steps.
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1)
    const pos = t * (source.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(source.length - 1, lo + 1)
    return source[lo] + (pos - lo) * (source[hi] - source[lo])
  })
}

/**
 * Chroma envelope across the ramp.
 *
 * Chroma has to fall off at both ends — a near-white cannot be colorful and a
 * near-black cannot either — but the peak should sit slightly *below* the
 * middle, around step 500–600, which is where real-world scales put their most
 * saturated step.
 */
function chromaAt(t: number, seedChroma: number, falloff: number): number {
  const peak = 0.56
  const distance = Math.abs(t - peak) / Math.max(peak, 1 - peak)
  const envelope = 1 - Math.pow(distance, 1.6) * falloff
  return seedChroma * Math.max(0.05, envelope)
}

/**
 * Solve for the lightness whose contrast against `background` hits `target`.
 *
 * The search stays on one side of the surface. Contrast is symmetric — a
 * colour a little lighter than a mid-gray surface scores the same as one a
 * little darker — so a scan over the whole range could satisfy a step on
 * whichever side happened to come closest, and against a gray reference the
 * ramp doubled back on itself: four steps darkened, the next climbed to
 * near-white. Below a light surface contrast only grows as lightness falls,
 * and above a dark one only as it rises, so confining the scan to that side
 * keeps the solved steps in the order their targets are in.
 */
function lightnessForContrast(
  hue: number,
  chroma: number,
  target: number,
  options: ScaleOptions,
): number {
  const surface = toOklch(options.background).l ?? 1
  const below = surface >= 0.5
  const lo = below ? 0.02 : Math.max(0.02, surface)
  const hi = below ? Math.min(0.995, surface) : 0.995
  let best = below ? hi : lo
  let bestDelta = Infinity
  for (let l = lo; l <= hi + 1e-9; l += 0.005) {
    const candidate: Oklch = { mode: 'oklch', l, c: Math.min(chroma, maxChroma(l, hue)), h: hue }
    const delta = Math.abs(score(candidate, options.background, options.metric) - target)
    if (delta < bestDelta - 1e-9) {
      bestDelta = delta
      best = l
    }
  }
  return best
}

/** Generate a full tonal scale from a seed color. */
export function generateScale(seed: ColorInput, options: Partial<ScaleOptions> = {}): ScaleStop[] {
  const opts = { ...DEFAULT_SCALE_OPTIONS, ...options }
  const base = toOklch(seed) as Oklch
  const hue = base.h ?? 0
  const seedChroma = base.c ?? 0.1
  const keys = keysFor(opts)
  const count = keys.length
  const purposes = purposesFor(opts.preset)
  const targets = targetsFor(opts, count)

  const anchorIndex =
    opts.anchor === null
      ? // Place the seed at whichever step its lightness is closest to.
        Math.round(
          (1 - ((base.l ?? 0.5) - opts.darkEnd) / (opts.lightEnd - opts.darkEnd)) * (count - 1),
        )
      : Math.round(opts.anchor * (count - 1))

  // An exponent of zero maps every step to the same point, and a negative one
  // sends the first step to infinity; neither is a ramp.
  const curve = Math.max(0.05, opts.curve)

  const stops: ScaleStop[] = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const curved = Math.pow(t, curve)
    const chroma = chromaAt(curved, seedChroma, opts.chromaFalloff)

    let l: number
    if (opts.mode === 'contrast') {
      l = lightnessForContrast(hue, chroma, targets[i], opts)
    } else {
      l = opts.lightEnd + curved * (opts.darkEnd - opts.lightEnd)
      if (opts.mode === 'hybrid') {
        const candidate: Oklch = { mode: 'oklch', l, c: Math.min(chroma, maxChroma(l, hue)), h: hue }
        const achieved = score(candidate, opts.background, opts.metric)
        if (achieved < targets[i]) {
          l = lightnessForContrast(hue, chroma, targets[i], opts)
        }
      }
    }

    let color: Oklch = {
      mode: 'oklch',
      l: Math.min(1, Math.max(0, l)),
      c: Math.min(chroma, maxChroma(Math.min(1, Math.max(0, l)), hue)),
      h: hue,
    }
    if (opts.pinSeed && i === Math.min(count - 1, Math.max(0, anchorIndex))) {
      color = base
    }
    color = mapToGamut(color, opts.gamut)

    const contrast = score(color, opts.background, opts.metric)
    stops.push({
      key: keys[i],
      color,
      contrast,
      // A tolerance of 0.02 is right for a ratio and absurdly tight for an
      // Lc value, where a whole unit is below the threshold of perception.
      meetsTarget: contrast >= targets[i] - (opts.metric === 'apca' ? 1 : 0.02),
      purpose: purposes[keys[i]] ?? '',
    })
  }
  return stops
}

/**
 * A neutral grey ramp that carries a hint of the brand hue.
 *
 * Pure greys next to a saturated brand color look dirty; a few percent of the
 * brand's chroma makes the whole interface feel intentional. This is what
 * every serious design system does and almost no generator offers.
 */
export function generateNeutralScale(
  seed: ColorInput,
  tint = 0.012,
  options: Partial<ScaleOptions> = {},
): ScaleStop[] {
  const base = toOklch(seed) as Oklch
  return generateScale(
    { mode: 'oklch', l: base.l ?? 0.5, c: tint, h: base.h ?? 0 },
    { ...options, chromaFalloff: 0.2, pinSeed: false },
  )
}

export const SCALE_MODE_LABELS: Record<ScaleMode, string> = {
  lightness: 'Even lightness',
  contrast: 'Solve for contrast',
  hybrid: 'Hybrid',
}

export const SCALE_PRESET_LABELS: Record<ScalePreset, string> = {
  tailwind: 'Tailwind 50–950',
  radix: 'Radix 1–12',
  material: 'Material tones',
  custom: 'Custom',
}

export const SCALE_MODE_HINTS: Record<ScaleMode, string> = {
  lightness:
    'Steps are spaced evenly in perceptual lightness. Produces the smoothest, best-looking ramp, and because OKLCH lightness is perceptual the steps genuinely look evenly spaced — which the same approach in HSL never achieves. It makes no promises about contrast, so check the badges.',
  contrast:
    'Each step is solved so its contrast against the reference surface hits a specific target. Accessibility is guaranteed by construction: step 700 will always clear 4.5:1 no matter which hue you seeded it with. The trade-off is that the ramp can look unevenly spaced, because equal contrast steps are not equal lightness steps.',
  hybrid:
    'Starts from the even-lightness ramp and only moves the steps that miss their target. You keep the smooth appearance almost everywhere and still get the guarantees where they matter. The recommended default for UI work.',
}

export const SCALE_PRESET_HINTS: Record<ScalePreset, string> = {
  tailwind:
    'Eleven steps named 50 through 950, the convention Tailwind established and most of the ecosystem now follows. 500 is the base color. Best choice if your codebase is Tailwind or if you want the naming everyone already recognizes.',
  radix:
    'Twelve steps where each number has a defined job: 1 is the app background, 3–5 are component fills, 6–8 are borders, 9 is the solid brand color, 11 is low-contrast text and 12 is high-contrast text. Harder to learn, dramatically easier to build components with, because you stop guessing which step to use.',
  material:
    'Material Design 3 tones, 0 (black) to 100 (white). Pairs with the M3 dark-mode strategy, where light and dark schemes select different tones from the same palette.',
  custom: 'Pick your own number of steps. Useful for compact scales (5 steps) or very fine ramps (20+).',
}
