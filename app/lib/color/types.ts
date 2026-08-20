/**
 * Core value types for the DevColorz color engine.
 *
 * Everything in the engine speaks culori `Color` objects internally and only
 * serialises to strings at the edges. The canonical working space is OKLCH:
 * it is perceptually uniform enough that "make this 10% lighter" means the
 * same thing for yellow and for blue, which HSL emphatically does not.
 */

import type { Color, Oklch, Rgb } from 'culori'

export type { Color, Oklch, Rgb }

/** Every color space the UI can expose as a set of editable channels. */
export type SpaceId =
  | 'oklch'
  | 'oklab'
  | 'okhsl'
  | 'okhsv'
  | 'lch'
  | 'lab'
  | 'hsl'
  | 'hsv'
  | 'hwb'
  | 'rgb'
  | 'p3'

/** Output notations available in the export pipeline. */
export type ColorFormat =
  | 'hex'
  | 'hexa'
  | 'rgb'
  | 'rgb-legacy'
  | 'hsl'
  | 'hsl-legacy'
  | 'lch'
  | 'lab'
  | 'oklch'
  | 'oklab'
  | 'display-p3'
  | 'color-srgb'

/** A single channel of a color space, as presented to the user. */
export interface ChannelDef {
  /** Key on the culori color object (e.g. `l`, `c`, `h`). */
  key: string
  /** Short label shown in the UI (e.g. `L`, `C`, `H`). */
  label: string
  /** Long label used in tooltips (e.g. `Lightness`). */
  name: string
  /** Inclusive domain of the channel in engine units. */
  min: number
  max: number
  /** Step used by sliders and numeric inputs. */
  step: number
  /** True for hue channels, which wrap around at `max`. */
  cyclic: boolean
  /**
   * Multiplier applied when showing the value to the user.
   * OKLCH lightness is 0..1 internally but shown as 0..100.
   */
  displayScale: number
  /** Suffix appended in the UI (`%`, `°`, ...). */
  unit: string
  /** Decimal places used when displaying. */
  precision: number
  /** One-line explanation surfaced in the channel tooltip. */
  hint: string
}

export interface SpaceDef {
  id: SpaceId
  label: string
  /** Longer description used by the "which space?" tooltip. */
  description: string
  channels: ChannelDef[]
  /** Perceptually uniform spaces are preferred for interpolation and scales. */
  perceptual: boolean
  /** Spaces that can address colors outside sRGB. */
  wideGamut: boolean
}

/** A palette entry. `id` is stable across shuffles so Vue keys stay honest. */
export interface Swatch {
  id: string
  /** Canonical color value. Always stored as OKLCH. */
  color: Oklch
  /** User-assigned name; when empty the UI falls back to the nearest name. */
  name: string
  /** Locked swatches survive re-rolls. */
  locked: boolean
  /** Optional semantic role hint used by previews and exports. */
  role?: SemanticRole | null
}

/**
 * Semantic roles a swatch can claim. Previews consume roles rather than
 * raw indices so a palette keeps looking intentional as it grows or shrinks.
 */
export type SemanticRole =
  | 'background'
  | 'surface'
  | 'text'
  | 'muted'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'border'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export interface Palette {
  id: string
  name: string
  swatches: Swatch[]
}

/** Inclusive numeric range. For cyclic channels `min > max` means "wraps". */
export interface Range {
  min: number
  max: number
}

/** Statistical shape used when drawing a value from a range. */
export type Distribution =
  | 'uniform'
  | 'gaussian'
  | 'edges'
  | 'golden'
  | 'stratified'
  | 'blue-noise'

/** Per-channel constraint used by the range-based generator. */
export interface ChannelConstraint {
  /** Inclusive range in engine units. */
  range: Range
  /** When true the channel is not randomised at all. */
  locked: boolean
  /** Fixed value used when `locked` is true. */
  value: number
  /** Shape of the random draw. */
  distribution: Distribution
  /**
   * Gaussian only: how tightly values cluster to the range centre.
   * 1 = one standard deviation spans half the range.
   */
  spread: number
}

export interface GeneratorConstraints {
  space: SpaceId
  channels: Record<string, ChannelConstraint>
  /** Minimum perceptual distance (deltaEOK x 100) between generated colors. */
  minDistance: number
  /** How out-of-gamut results are handled. */
  gamut: GamutStrategy
  /** Deterministic seed. `null` means "use fresh entropy on every roll". */
  seed: number | null
}

export type GamutStrategy =
  | 'clip'
  | 'chroma-reduce'
  | 'css4'
  | 'keep'

export interface RandomOptions {
  count: number
  constraints: GeneratorConstraints
  /** Colors that must be preserved (locked swatches). */
  keep?: Oklch[]
  /** Overrides `constraints.seed` for a single call. */
  seed?: number
}
