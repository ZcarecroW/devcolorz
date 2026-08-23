/**
 * Contrast — WCAG 2.x and APCA.
 *
 * WCAG 2 is what conformance is still measured against, so it ships first.
 * APCA is what actually predicts readability, especially for light text on
 * dark backgrounds and for thin type, so both are shown side by side.
 */

import { wcagContrast, wcagLuminance } from 'culori'
import { toOklch, toRgb } from './convert'
import { maxChroma } from './gamut'
import type { Oklch, Rgb, ColorInput } from './types'

/* ------------------------------------------------------------------ *
 * WCAG 2.x
 * ------------------------------------------------------------------ */

/** Relative luminance, per WCAG 2.x. */
export function luminance(color: ColorInput): number {
  return wcagLuminance(color)
}

/** WCAG contrast ratio, 1 to 21. Order of arguments does not matter. */
export function wcag(a: ColorInput, b: ColorInput): number {
  return wcagContrast(a, b)
}

export type WcagLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/** Which WCAG 2.x level a ratio satisfies for the given text size. */
export function wcagLevel(ratio: number, large = false): WcagLevel {
  if (large) {
    if (ratio >= 4.5) return 'AAA'
    if (ratio >= 3) return 'AA'
    return 'Fail'
  }
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}

/** WCAG 2.x also requires 3:1 for UI components and graphical objects. */
export function passesNonText(ratio: number): boolean {
  return ratio >= 3
}

/* ------------------------------------------------------------------ *
 * APCA (APCA-W3, algorithm 0.1.9)
 * ------------------------------------------------------------------ */

const APCA = {
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const

function apcaY(color: ColorInput): number {
  const c = toRgb(color) as Rgb
  const ch = (v: number) => Math.pow(Math.min(1, Math.max(0, v)), APCA.mainTRC)
  return ch(c.r) * APCA.sRco + ch(c.g) * APCA.sGco + ch(c.b) * APCA.sBco
}

function softClamp(y: number): number {
  return y >= APCA.blkThrs ? y : y + Math.pow(APCA.blkThrs - y, APCA.blkClmp)
}

/**
 * APCA lightness contrast, in Lc units from about -108 to 106.
 *
 * Positive Lc means dark text on a light background; negative means light
 * text on dark. The sign carries meaning — unlike WCAG, APCA is directional,
 * because the eye does not treat the two polarities the same way.
 */
export function apca(text: ColorInput, background: ColorInput): number {
  const ytxt = softClamp(apcaY(text))
  const ybg = softClamp(apcaY(background))
  if (Math.abs(ybg - ytxt) < APCA.deltaYmin) return 0

  let output: number
  if (ybg > ytxt) {
    const sapc = (Math.pow(ybg, APCA.normBG) - Math.pow(ytxt, APCA.normTXT)) * APCA.scaleBoW
    output = sapc < APCA.loClip ? 0 : sapc - APCA.loBoWoffset
  } else {
    const sapc = (Math.pow(ybg, APCA.revBG) - Math.pow(ytxt, APCA.revTXT)) * APCA.scaleWoB
    output = sapc > -APCA.loClip ? 0 : sapc + APCA.loWoBoffset
  }
  return output * 100
}

/**
 * What a translucent ink actually becomes over its background.
 *
 * Browsers composite in sRGB, so the contrast reaching the eye is that of this
 * blend against the background — never that of the ink on its own.
 */
export function inkOver(ink: ColorInput, background: ColorInput, alpha: number): Rgb {
  const a = toRgb(ink)
  const b = toRgb(background)
  const mix = (x: number, y: number) => alpha * x + (1 - alpha) * y
  return { mode: 'rgb', r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) }
}

/**
 * The faintest an ink may be drawn over a background and still read at `target` Lc.
 *
 * Faded chrome is drawn in the foreground colour at some opacity, which quietly
 * makes its legibility a function of whatever sits underneath: the same 0.7
 * costs little over white or black and a great deal over a mid-tone. Solving
 * for the opacity instead of fixing it keeps the intent — quiet chrome — while
 * making the result the same everywhere.
 *
 * Returns `floor` when the fade is already affordable and 1 when even full
 * strength cannot reach the target, so the answer is always usable as-is.
 */
export function faintestReadable(
  ink: ColorInput,
  background: ColorInput,
  target: number,
  floor = 0.7,
): number {
  const reads = (alpha: number) => Math.abs(apca(inkOver(ink, background, alpha), background))
  if (reads(floor) >= target) return floor
  if (reads(1) < target) return 1
  let low = floor
  let high = 1
  // Ten halvings land within 0.001 of the crossing — finer than the eye, and
  // finer than the two decimals the value is rounded to.
  for (let i = 0; i < 10; i += 1) {
    const mid = (low + high) / 2
    if (reads(mid) >= target) high = mid
    else low = mid
  }
  return Math.round(high * 100) / 100
}

/** Human-readable verdict for an APCA Lc value. */
export function apcaVerdict(lc: number): { label: string; use: string; ok: boolean } {
  const v = Math.abs(lc)
  if (v >= 90) return { label: 'Lc 90+', use: 'Body text at any weight, including thin fonts.', ok: true }
  if (v >= 75) return { label: 'Lc 75+', use: 'Body text from 16px at normal weight. The practical minimum for reading.', ok: true }
  if (v >= 60) return { label: 'Lc 60+', use: 'Larger or heavier text: 18px semibold, 24px normal, headlines.', ok: true }
  if (v >= 45) return { label: 'Lc 45+', use: 'Large headlines and non-text elements such as icons and borders.', ok: true }
  if (v >= 30) return { label: 'Lc 30+', use: 'Disabled states and decorative dividers only. Not readable content.', ok: false }
  if (v >= 15) return { label: 'Lc 15+', use: 'Invisible for text. Barely acceptable for a hairline against a fill.', ok: false }
  return { label: 'Lc < 15', use: 'Effectively no contrast.', ok: false }
}

/* ------------------------------------------------------------------ *
 * Pairing helpers
 * ------------------------------------------------------------------ */

export type ContrastMetric = 'wcag' | 'apca'

/** Score a pair with the chosen metric, normalised so bigger is always better. */
export function score(text: ColorInput, background: ColorInput, metric: ContrastMetric): number {
  return metric === 'apca' ? Math.abs(apca(text, background)) : wcag(text, background)
}

/**
 * Pick the more readable of black and white for a background.
 * The workhorse behind every preview: it is what keeps generated mockups
 * legible no matter what palette the user throws at them.
 */
export function bestBlackOrWhite(background: ColorInput, metric: ContrastMetric = 'apca'): Oklch {
  const white: Oklch = { mode: 'oklch', l: 1, c: 0, h: 0 }
  const black: Oklch = { mode: 'oklch', l: 0, c: 0, h: 0 }
  return score(white, background, metric) >= score(black, background, metric) ? white : black
}

/** Pick the most readable candidate from a list, for a given background. */
export function bestForeground(
  background: ColorInput,
  candidates: ColorInput[],
  metric: ContrastMetric = 'apca',
): Oklch | null {
  let best: ColorInput | null = null
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const s = score(candidate, background, metric)
    if (s > bestScore) {
      bestScore = s
      best = candidate
    }
  }
  return best ? (toOklch(best) as Oklch) : null
}

export interface ReadableOptions {
  /** Minimum acceptable score in the metric's own units. */
  target?: number
  metric?: ContrastMetric
  /** Preserve the candidate's hue and chroma, moving only lightness. */
  preserveHue?: boolean
}

/**
 * Take a color and move its lightness until it reads acceptably against a
 * background, keeping hue and as much chroma as the gamut allows.
 *
 * This is the "auto-fix" behind the accessibility lab: it produces a color
 * that still belongs to the palette rather than falling back to black.
 * Returns `null` if no lightness along the hue reaches the target.
 */
export function makeReadable(
  color: ColorInput,
  background: ColorInput,
  options: ReadableOptions = {},
): Oklch | null {
  const metric = options.metric ?? 'apca'
  const target = options.target ?? (metric === 'apca' ? 75 : 4.5)
  const base = toOklch(color) as Oklch
  const hue = base.h ?? 0
  const chroma = base.c ?? 0

  const at = (l: number): Oklch => ({
    mode: 'oklch',
    l,
    c: Math.min(chroma, maxChroma(l, hue)),
    h: hue,
  })

  if (score(base, background, metric) >= target) return base

  // Search both directions from the original lightness and take whichever
  // reaches the target with the smaller move — the least visible correction.
  let down: Oklch | null = null
  let up: Oklch | null = null
  const startL = base.l ?? 0.5
  for (let step = 0.01; step <= 1; step += 0.01) {
    if (!down && startL - step >= 0) {
      const candidate = at(startL - step)
      if (score(candidate, background, metric) >= target) down = candidate
    }
    if (!up && startL + step <= 1) {
      const candidate = at(startL + step)
      if (score(candidate, background, metric) >= target) up = candidate
    }
    if (down || up) break
  }
  if (down && up) {
    return Math.abs((down.l ?? 0) - startL) <= Math.abs((up.l ?? 0) - startL) ? down : up
  }
  return down ?? up
}

/** Every pairwise contrast in a palette — the data behind the contrast matrix. */
export function contrastMatrix(colors: ColorInput[], metric: ContrastMetric = 'wcag'): number[][] {
  return colors.map((a) => colors.map((b) => (metric === 'apca' ? apca(a, b) : wcag(a, b))))
}

export const METRIC_LABELS: Record<ContrastMetric, string> = {
  wcag: 'WCAG 2.x ratio',
  apca: 'APCA Lc',
}

export const METRIC_HINTS: Record<ContrastMetric, string> = {
  wcag: 'The ratio defined by WCAG 2.x, from 1:1 to 21:1. It is what accessibility audits and most legislation still measure, so you usually have to satisfy it. Its weakness is well documented: it over-rates dark backgrounds and under-rates mid-tone pairs, and it ignores font size and weight entirely.',
  apca: 'The perceptual contrast algorithm developed for WCAG 3. It reports Lc values from roughly -108 to 106 and accounts for polarity — light-on-dark and dark-on-light are scored differently, because the eye treats them differently. It maps directly onto usable font sizes and weights. Not yet a legal standard, but a far better predictor of whether text is actually readable.',
}
