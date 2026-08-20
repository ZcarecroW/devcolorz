/**
 * Export configuration.
 *
 * Every knob the brief asks for lives here: notation, variable naming,
 * transparent variants, light/dark derivation and the inversion algorithm —
 * settable globally and overridable per colour, because in a real design system
 * some colours want a dark variant and some are mode-agnostic.
 */

import type { ColorFormat, Oklch } from '@/lib/color/types'
import type { InvertStrategy } from '@/lib/color/invert'
import type { ScalePreset, ScaleMode } from '@/lib/color/scale'

export type NameCase = 'kebab' | 'camel' | 'snake' | 'pascal' | 'constant'
export type AlphaMode = 'ladder' | 'solved' | 'overlay'
export type DarkDelivery = 'class' | 'media' | 'attribute' | 'both'

/** Per-colour overrides, keyed by swatch id. */
export interface ColorOverride {
  /** Replaces the swatch's own name for this export only. */
  name?: string
  /** Emit transparent variants for this colour. Falls back to the global flag. */
  alpha?: boolean
  /** Emit a dark-mode counterpart. Falls back to the global flag. */
  dark?: boolean
  /** A hand-picked dark value, overriding whatever the strategy would compute. */
  darkColor?: Oklch | null
  /** Emit a full tonal scale for this colour. */
  scale?: boolean
  /** Leave this colour out of the export entirely. */
  exclude?: boolean
}

export interface ExportConfig {
  /* ---- notation ---- */
  format: ColorFormat
  /** Decimal places on float channels. */
  precision: number

  /* ---- naming ---- */
  /** Prepended to every variable: `color` gives `--color-brand`. */
  prefix: string
  /** Appended to every variable, before any variant suffix. */
  suffix: string
  case: NameCase
  /**
   * Use the swatch's own name when it has one. With this off, everything is
   * numbered — which is uglier but immune to a rename breaking a stylesheet.
   */
  useNames: boolean
  /** Fallback stem for unnamed colours: `color-1`, `color-2`, … */
  fallbackStem: string

  /* ---- structure ---- */
  emitScales: boolean
  scalePreset: ScalePreset
  scaleMode: ScaleMode
  scaleSteps: number

  emitAlpha: boolean
  alphaMode: AlphaMode
  alphaSteps: number[]

  /* ---- light / dark ---- */
  emitDark: boolean
  darkStrategy: InvertStrategy
  darkFloor: number
  darkCeiling: number
  chromaCompensation: number
  darkDelivery: DarkDelivery
  /** Selector used for the class and attribute deliveries. */
  darkClass: string
  darkAttribute: string

  /* ---- output shape ---- */
  selector: string
  includeComments: boolean
  /** Add a contrast note beside each colour. */
  includeContrast: boolean
  sortBy: 'palette' | 'name' | 'lightness'

  /** Per-swatch overrides. */
  overrides: Record<string, ColorOverride>
}

export const DEFAULT_ALPHA_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90]

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: 'oklch',
  precision: 3,
  prefix: 'color',
  suffix: '',
  case: 'kebab',
  useNames: true,
  fallbackStem: 'color',

  emitScales: false,
  scalePreset: 'tailwind',
  scaleMode: 'hybrid',
  scaleSteps: 11,

  emitAlpha: false,
  alphaMode: 'ladder',
  alphaSteps: DEFAULT_ALPHA_STEPS,

  emitDark: true,
  darkStrategy: 'oklch-curve',
  darkFloor: 0.14,
  darkCeiling: 0.93,
  chromaCompensation: 0.55,
  darkDelivery: 'class',
  darkClass: '.dark',
  darkAttribute: '[data-theme="dark"]',

  selector: ':root',
  includeComments: true,
  includeContrast: false,
  sortBy: 'palette',

  overrides: {},
}

export const NAME_CASE_LABELS: Record<NameCase, string> = {
  kebab: 'kebab-case',
  camel: 'camelCase',
  snake: 'snake_case',
  pascal: 'PascalCase',
  constant: 'CONSTANT_CASE',
}

export const NAME_CASE_HINTS: Record<NameCase, string> = {
  kebab: 'The convention for CSS custom properties and the only one that reads naturally in a stylesheet. Use this unless the target language forces otherwise.',
  camel: 'For JavaScript and TypeScript objects, where a hyphen would force bracket access.',
  snake: 'Common in Python, Ruby and some token pipelines.',
  pascal: 'For Swift and Kotlin type members.',
  constant: 'SCREAMING_SNAKE, for constants in languages that expect it.',
}

export const ALPHA_MODE_LABELS: Record<AlphaMode, string> = {
  ladder: 'Opacity ladder',
  solved: 'Solved alpha',
  overlay: 'Neutral overlay',
}

export const DARK_DELIVERY_LABELS: Record<DarkDelivery, string> = {
  class: 'Class selector',
  media: 'prefers-color-scheme',
  attribute: 'Data attribute',
  both: 'Media query + class override',
}

export const DARK_DELIVERY_HINTS: Record<DarkDelivery, string> = {
  class: 'Dark values live under a class you toggle from JavaScript. Gives the user an explicit choice and is what Tailwind and shadcn expect. Needs a script to apply the class before first paint, or the page flashes.',
  media: 'Dark values live in a `prefers-color-scheme: dark` media query. Zero JavaScript and no flash, but the user cannot override the operating system from inside your site.',
  attribute: 'Dark values hang off a `data-theme` attribute. Same trade-offs as the class approach, but it scales to more than two themes.',
  both: 'The media query supplies the default, and a class can override it in either direction. The most work, and the only option that gives you no flash *and* a working in-page toggle — which is why it is what serious sites ship.',
}

export const FORMAT_ORDER: ColorFormat[] = [
  'oklch',
  'hex',
  'hexa',
  'rgb',
  'hsl',
  'oklab',
  'lch',
  'lab',
  'display-p3',
  'rgb-legacy',
  'hsl-legacy',
  'color-srgb',
]
