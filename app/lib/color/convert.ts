/**
 * Conversion and serialisation.
 *
 * Rule of the codebase: colors are `Oklch` objects everywhere except at the
 * boundary. `parse*` brings values in, `format*` sends them out.
 */

import {
  converter,
  formatHex,
  formatHex8,
  parse as culoriParse,
  type Color,
  type Hsl,
  type Lab,
  type Lch,
  type Oklab,
  type Oklch,
  type Rgb,
} from 'culori'
import { getSpace } from './spaces'
import type { ColorFormat, ColorInput, SpaceId } from './types'

/**
 * Typed converter wrappers.
 *
 * culori's `converter()` widens its return type to `T | undefined` as soon as
 * a string is passed in, which would mean a non-null assertion at every one of
 * the hundreds of call sites in this engine. These wrappers accept both forms
 * and always return a color, because culori only returns undefined for input
 * it cannot parse — and every caller here has already validated its input.
 */
function typedConverter<T extends Color>(mode: Parameters<typeof converter>[0]) {
  const fn = converter(mode as never)
  return (color: ColorInput): T => fn(color as Color) as unknown as T
}

export const toOklch = typedConverter<Oklch>('oklch')
export const toOklab = typedConverter<Oklab>('oklab')
export const toOkhsl = typedConverter<Color>('okhsl')
export const toOkhsv = typedConverter<Color>('okhsv')
export const toRgb = typedConverter<Rgb>('rgb')
export const toHsl = typedConverter<Hsl>('hsl')
export const toHsv = typedConverter<Color>('hsv')
export const toHwb = typedConverter<Color>('hwb')
export const toLch = typedConverter<Lch>('lch')
export const toLab = typedConverter<Lab>('lab')
export const toP3 = typedConverter<Rgb>('p3')
export const toLrgb = typedConverter<Rgb>('lrgb')

const CONVERTERS: Record<SpaceId, (c: ColorInput) => Color> = {
  oklch: toOklch as never,
  oklab: toOklab as never,
  okhsl: toOkhsl as never,
  okhsv: toOkhsv as never,
  lch: toLch as never,
  lab: toLab as never,
  hsl: toHsl as never,
  hsv: toHsv as never,
  hwb: toHwb as never,
  rgb: toRgb as never,
  p3: toP3 as never,
}

/** Convert any color into the given space, preserving alpha. */
export function toSpace(color: ColorInput, space: SpaceId): Color {
  return CONVERTERS[space](color)
}

/** Round-trip a color in an arbitrary space back to the canonical OKLCH. */
export function fromSpace(color: ColorInput): Oklch {
  return toOklch(color) as Oklch
}

/**
 * Parse user input. Accepts everything culori accepts (hex, named colors,
 * rgb()/hsl()/lab()/lch()/oklab()/oklch()/color()) plus bare hex without `#`.
 */
export function parseColor(input: string): Oklch | null {
  const raw = input.trim()
  if (!raw) return null
  const candidates = [raw]
  if (/^[0-9a-f]{3,8}$/i.test(raw)) candidates.push(`#${raw}`)
  for (const candidate of candidates) {
    const parsed = culoriParse(candidate)
    if (parsed) {
      const ok = toOklch(parsed) as Oklch
      // Achromatic colors come back with h === undefined; normalise to 0 so
      // arithmetic downstream never produces NaN.
      if (ok.h === undefined || Number.isNaN(ok.h)) ok.h = 0
      return ok
    }
  }
  return null
}

/** Parse or throw — for internal call sites where the value is known-good. */
export function mustParse(input: string): Oklch {
  const parsed = parseColor(input)
  if (!parsed) throw new Error(`Not a color: ${input}`)
  return parsed
}

function n(value: number | undefined, digits: number): string {
  const v = Number.isFinite(value) ? (value as number) : 0
  const rounded = Number(v.toFixed(digits))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

function alphaSuffix(alpha: number | undefined, modern: boolean): string {
  if (alpha === undefined || alpha >= 1) return ''
  return modern ? ` / ${n(alpha, 3)}` : `, ${n(alpha, 3)}`
}

/**
 * Serialise a color to a CSS string in the requested notation.
 *
 * `precision` controls decimals on float channels; integers stay integers.
 * Hex output silently gamut-clips, because hex cannot express anything else.
 */
export function formatColor(color: ColorInput, format: ColorFormat, precision = 3): string {
  switch (format) {
    case 'hex':
      return (formatHex(color) ?? '#000000').toLowerCase()
    case 'hexa': {
      const a = toRgb(color).alpha
      if (a === undefined || a >= 1) return (formatHex(color) ?? '#000000').toLowerCase()
      return (formatHex8(color) ?? '#00000000').toLowerCase()
    }
    case 'rgb': {
      const c = toRgb(color) as Rgb
      const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
      return `rgb(${to255(c.r)} ${to255(c.g)} ${to255(c.b)}${alphaSuffix(c.alpha, true)})`
    }
    case 'rgb-legacy': {
      const c = toRgb(color) as Rgb
      const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
      const a = c.alpha
      const fn = a !== undefined && a < 1 ? 'rgba' : 'rgb'
      return `${fn}(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)}${alphaSuffix(a, false)})`
    }
    case 'hsl': {
      const c = toHsl(color) as Hsl
      return `hsl(${n(c.h ?? 0, 2)} ${n((c.s ?? 0) * 100, 2)}% ${n((c.l ?? 0) * 100, 2)}%${alphaSuffix(c.alpha, true)})`
    }
    case 'hsl-legacy': {
      const c = toHsl(color) as Hsl
      const a = c.alpha
      const fn = a !== undefined && a < 1 ? 'hsla' : 'hsl'
      return `${fn}(${n(c.h ?? 0, 2)}, ${n((c.s ?? 0) * 100, 2)}%, ${n((c.l ?? 0) * 100, 2)}%${alphaSuffix(a, false)})`
    }
    case 'lch': {
      const c = toLch(color) as Lch
      return `lch(${n(c.l, precision)}% ${n(c.c, precision)} ${n(c.h ?? 0, precision)}${alphaSuffix(c.alpha, true)})`
    }
    case 'lab': {
      const c = toLab(color) as Lab
      return `lab(${n(c.l, precision)}% ${n(c.a, precision)} ${n(c.b, precision)}${alphaSuffix(c.alpha, true)})`
    }
    case 'oklch': {
      const c = toOklch(color) as Oklch
      return `oklch(${n((c.l ?? 0) * 100, precision)}% ${n(c.c ?? 0, Math.max(precision, 4))} ${n(c.h ?? 0, precision)}${alphaSuffix(c.alpha, true)})`
    }
    case 'oklab': {
      const c = toOklab(color) as Oklab
      return `oklab(${n((c.l ?? 0) * 100, precision)}% ${n(c.a ?? 0, Math.max(precision, 4))} ${n(c.b ?? 0, Math.max(precision, 4))}${alphaSuffix(c.alpha, true)})`
    }
    case 'display-p3': {
      const c = toP3(color) as unknown as Rgb
      return `color(display-p3 ${n(c.r, precision)} ${n(c.g, precision)} ${n(c.b, precision)}${alphaSuffix(c.alpha, true)})`
    }
    case 'color-srgb': {
      const c = toRgb(color) as Rgb
      return `color(srgb ${n(c.r, precision)} ${n(c.g, precision)} ${n(c.b, precision)}${alphaSuffix(c.alpha, true)})`
    }
    default:
      return (formatHex(color) ?? '#000000').toLowerCase()
  }
}

/** Always-safe CSS string for painting swatches in the DOM. */
export function css(color: ColorInput): string {
  return formatColor(color, 'oklch')
}

/** Hex without the `#`, uppercase — the notation palettes are usually shared in. */
export function hexToken(color: ColorInput): string {
  return (formatHex(color) ?? '#000000').slice(1).toUpperCase()
}

/** Read the channel values of a color as it appears in the given space. */
export function channelValues(color: ColorInput, space: SpaceId): Record<string, number> {
  const converted = toSpace(color, space) as unknown as Record<string, number | undefined>
  const out: Record<string, number> = {}
  for (const ch of getSpace(space).channels) {
    const v = converted[ch.key]
    out[ch.key] = Number.isFinite(v) ? (v as number) : 0
  }
  return out
}

/** Build a color from channel values expressed in the given space. */
export function fromChannelValues(space: SpaceId, values: Record<string, number>, alpha = 1): Oklch {
  const obj: Record<string, unknown> = { mode: space === 'p3' ? 'p3' : space }
  for (const ch of getSpace(space).channels) obj[ch.key] = values[ch.key] ?? 0
  if (alpha < 1) obj.alpha = alpha
  return fromSpace(obj as unknown as Color)
}

export const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: 'HEX',
  hexa: 'HEX + alpha',
  rgb: 'rgb() — modern',
  'rgb-legacy': 'rgb() — legacy commas',
  hsl: 'hsl() — modern',
  'hsl-legacy': 'hsl() — legacy commas',
  lch: 'lch()',
  lab: 'lab()',
  oklch: 'oklch()',
  oklab: 'oklab()',
  'display-p3': 'color(display-p3 …)',
  'color-srgb': 'color(srgb …)',
}

export const FORMAT_HINTS: Record<ColorFormat, string> = {
  hex: 'Universal support, no alpha, clips anything outside sRGB. The safe default for handoff.',
  hexa: 'Eight-digit hex carries alpha. Supported everywhere modern, invisible to IE.',
  rgb: 'Space-separated CSS Color 4 syntax. Baseline in all current browsers.',
  'rgb-legacy': 'Comma syntax with the rgba() variant. Choose this if the output feeds an old preprocessor or a CSS-in-JS runtime that parses colors itself.',
  hsl: 'Readable and easy to hand-tweak, but its lightness is not perceptual — the same L reads very differently across hues.',
  'hsl-legacy': 'Comma syntax with the hsla() variant, for maximum tooling compatibility.',
  lch: 'CIELAB polar. Perceptual and wide-gamut, with a known hue drift in the blues.',
  lab: 'CIELAB cartesian. Common in print pipelines.',
  oklch: 'The recommended output. Perceptually uniform, wide-gamut, human-readable, and what Tailwind v4 and shadcn now ship. Supported in every evergreen browser since 2023.',
  oklab: 'OKLab cartesian — the same color science as OKLCH without the hue angle.',
  'display-p3': 'Targets the wider P3 gamut of modern displays. Pair it with an sRGB fallback rule for older screens.',
  'color-srgb': 'Explicit sRGB in CSS Color 4 syntax. Useful when a stylesheet mixes several color spaces and you want the space stated.',
}
