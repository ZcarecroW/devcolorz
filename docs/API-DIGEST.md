### app/lib/color/types.ts
export type { Color, Oklch, Rgb }
export type ColorInput
export type SpaceId =
export type ColorFormat =
export interface ChannelDef
  key: string
  label: string
  name: string
  min: number
  max: number
  step: number
  cyclic: boolean
  displayScale: number
  unit: string
  precision: number
  hint: string
}
export interface SpaceDef
  id: SpaceId
  label: string
  description: string
  channels: ChannelDef[]
  perceptual: boolean
  wideGamut: boolean
}
export interface Swatch
  id: string
  color: Oklch
  name: string
  locked: boolean
  role?: SemanticRole | null
}
export type SemanticRole =
export interface Palette
  id: string
  name: string
  swatches: Swatch[]
}
export interface Range
  min: number
  max: number
}
export type Distribution =
export interface ChannelConstraint
  range: Range
  locked: boolean
  value: number
  distribution: Distribution
  spread: number
}
export interface GeneratorConstraints
  space: SpaceId
  channels: Record<string, ChannelConstraint>
  minDistance: number
  gamut: GamutStrategy
  seed: number | null
}
export type GamutStrategy =
export interface RandomOptions
  count: number
  constraints: GeneratorConstraints
  keep?: Oklch[]
  seed?: number
}

### app/lib/color/spaces.ts
  key: 'h',
  label: 'H',
  name: 'Hue',
  min: 0,
  max: 360,
  step: 1,
  cyclic: true,
  displayScale: 1,
  unit: '°',
  precision: 0,
})
export const SPACES: Record<SpaceId, SpaceDef>
  oklch:
  oklab:
  okhsl:
  okhsv:
  lch:
  lab:
  hsl:
  hsv:
  hwb:
  rgb:
}
export const SPACE_IDS
export function getSpace(id: SpaceId): SpaceDef
}
export function getChannel(space: SpaceId, key: string): ChannelDef | undefined
}

### app/lib/color/convert.ts
} from 'culori'
}
export const toOklch
export const toOklab
export const toOkhsl
export const toOkhsv
export const toRgb
export const toHsl
export const toHsv
export const toHwb
export const toLch
export const toLab
export const toP3
export const toLrgb
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
}
export function toSpace(color: ColorInput, space: SpaceId): Color
}
export function fromSpace(color: ColorInput): Oklch
}
export function parseColor(input: string): Oklch | null
}
export function mustParse(input: string): Oklch
}
}
}
export function formatColor(color: ColorInput, format: ColorFormat, precision
}
export function css(color: ColorInput): string
}
export function hexToken(color: ColorInput): string
}
export function channelValues(color: ColorInput, space: SpaceId): Record<string, number>
}
export function fromChannelValues(space: SpaceId, values: Record<string, number>, alpha
}
export const FORMAT_LABELS: Record<ColorFormat, string>
  hex: 'HEX',
  hexa: 'HEX + alpha',
  rgb: 'rgb() — modern',
  hsl: 'hsl() — modern',
  lch: 'lch()',
  lab: 'lab()',
  oklch: 'oklch()',
  oklab: 'oklab()',
}
export const FORMAT_HINTS: Record<ColorFormat, string>
  hex: 'Universal support, no alpha, clips anything outside sRGB. The safe default for handoff.',
  hexa: 'Eight-digit hex carries alpha. Supported everywhere modern, invisible to IE.',
  rgb: 'Space-separated CSS Color 4 syntax. Baseline in all current browsers.',
  hsl: 'Readable and easy to hand-tweak, but its lightness is not perceptual — the same L reads very differently across hues.',
  lch: 'CIELAB polar. Perceptual and wide-gamut, with a known hue drift in the blues.',
  lab: 'CIELAB cartesian. Common in print pipelines.',
  oklch: 'The recommended output. Perceptually uniform, wide-gamut, human-readable, and what Tailwind v4 and shadcn now ship. Supported in every evergreen browser since 2023.',
  oklab: 'OKLab cartesian — the same color science as OKLCH without the hue angle.',
}

### app/lib/color/gamut.ts
export type GamutId
  srgb: converter('rgb') as never,
}
export function isInGamut(color: ColorInput, gamut: GamutId
}
export function clipToGamut(color: ColorInput): Oklch
}
export function reduceChroma(color: ColorInput): Oklch
}
export function deltaEOK(a: ColorInput, b: ColorInput): number
}
export function cssGamutMap(color: ColorInput, gamut: GamutId
}
export function mapToGamut(color: ColorInput, strategy: GamutStrategy, gamut: GamutId
}
export function maxChroma(l: number, h: number, gamut: GamutId
}
export const GAMUT_STRATEGY_LABELS: Record<GamutStrategy, string>
  clip: 'Clip channels',
  keep: 'Keep out-of-gamut',
}
export const GAMUT_STRATEGY_HINTS: Record<GamutStrategy, string>
  clip: 'Clamps each RGB channel to 0–1. Fastest, and the worst: it visibly shifts both hue and lightness. Included because some pipelines expect exactly this behaviour.',
  keep: 'Leaves the color as-is. Correct if you are targeting Display P3 or authoring in a wide-gamut pipeline — but hex and rgb() exports will still clip it.',
}

### app/lib/color/random.ts
} from './types'
export interface Rng
}
export function createRng(seed: number): Rng
}
export function randomSeed(): number
}
}
export function sample(
  rng: Rng,
  distribution: Distribution,
  spread: number,
  index: number,
  count: number,
}
export function mapToRange(t: number, range: Range, cyclic: boolean, wrapAt: number): number
}
export function rangeSpan(range: Range, cyclic: boolean, wrapAt: number): number
}
export function inRange(value: number, range: Range, cyclic: boolean, wrapAt: number): boolean
}
export function defaultConstraints(space: SpaceId
}
export function retargetConstraints(
  constraints: GeneratorConstraints,
  space: SpaceId,
}
export interface GenerateOptions
  count: number
  constraints: GeneratorConstraints
  avoid?: ColorInput[]
  seed?: number
}
export function randomColor(
  rng: Rng,
  constraints: GeneratorConstraints,
}
export function generatePalette(options: GenerateOptions): Oklch[]
}
export function previewSwatches(
  constraints: GeneratorConstraints,
}
export function constraintsFromColors(
  colors: ColorInput[],
  space: SpaceId
}
export const DISTRIBUTION_LABELS: Record<Distribution, string>
  uniform: 'Uniform',
  gaussian: 'Gaussian',
  edges: 'Edges',
  golden: 'Golden ratio',
  stratified: 'Stratified',
}
export const DISTRIBUTION_HINTS: Record<Distribution, string>
  uniform: 'Every value in the range is equally likely. Honest randomness — which also means occasional clumps.',
  gaussian: 'Values cluster around the middle of the range and thin out toward the edges. Use it when you want a dominant tone with occasional outliers. The spread control widens or tightens the bell.',
  edges: 'The inverse of gaussian: values are pushed toward both ends of the range. Good for high-contrast pairs where you want darks and lights but nothing in between.',
  golden: 'Steps around the range by the golden ratio. Consecutive colors are maximally far apart with no clumping at all — the classic trick for generating distinct hues.',
  stratified: 'Splits the range into one bin per color and jitters within each bin. Guarantees the whole range is covered evenly, with a bit of randomness left in.',
}

### app/lib/color/harmony.ts
export type HarmonyId =
export type HueWheel
export interface HarmonyOptions
  wheel: HueWheel
  count: number
  angle: number
  vary: boolean
  gamut: GamutStrategy
}
export const DEFAULT_HARMONY_OPTIONS: HarmonyOptions
  wheel: 'ryb',
  count: 5,
  angle: 30,
  vary: true,
  gamut: 'css4',
}
}
export function toRybHue(hue: number): number
}
export function fromRybHue(hue: number): number
}
export function rotateHue(hue: number, degrees: number, wheel: HueWheel): number
}
  complementary: [0, 180],
  triadic: [0, 120, 240],
  tetradic: [0, 60, 180, 240],
  square: [0, 90, 180, 270],
  compound: [0, 30, 180, 210, 330],
}
}
}
}
export function harmony(seed: ColorInput, id: HarmonyId, options: Partial<HarmonyOptions>
}
export const HARMONY_LABELS: Record<HarmonyId, string>
  complementary: 'Complementary',
  analogous: 'Analogous',
  triadic: 'Triadic',
  tetradic: 'Tetradic',
  square: 'Square',
  compound: 'Compound',
  monochromatic: 'Monochromatic',
  shades: 'Shades',
  tints: 'Tints',
  tones: 'Tones',
}
export const HARMONY_HINTS: Record<HarmonyId, string>
  complementary: 'The seed and the hue directly opposite it. Maximum contrast, high energy — and hard to use in quantity. Best as a small accent against a dominant color.',
  analogous: 'Neighbouring hues, evenly stepped. Naturally harmonious and calm; the step angle controls how adventurous it gets. Needs a lightness or chroma difference to stay legible.',
  triadic: 'Three hues evenly spaced around the wheel. Vibrant and balanced. Let one dominate and use the other two sparingly.',
  tetradic: 'Two complementary pairs forming a rectangle. Rich but demanding — pick one color to lead.',
  square: 'Four hues at 90° intervals. Like tetradic but perfectly even, so no hue family dominates by default.',
  compound: 'A complementary pair softened by the analogous neighbours of each. Contrast plus cohesion.',
  monochromatic: 'One hue at evenly spaced perceptual lightness steps, with chroma tapering at the extremes so the light and dark ends stay believable. The most reliably professional-looking option.',
  shades: 'The seed darkened toward black in even perceptual steps. Chroma is reduced as it darkens because deep colors cannot hold much of it.',
  tints: 'The seed lightened toward white. Useful for backgrounds and hover states derived from a brand color.',
  tones: 'The seed desaturated toward grey at constant lightness. Produces the muted, editorial palettes that pure hue rotations never find.',
}
export const WHEEL_LABELS: Record<HueWheel, string>
  ryb: 'Artistic (RYB)',
  oklch: 'Perceptual (OKLCH)',
  hsl: 'Digital (HSL)',
}
export const WHEEL_HINTS: Record<HueWheel, string>
  ryb: 'The red–yellow–blue wheel taught in art school. Blue’s complement is orange, red’s is green. This is what most people mean by "complementary", so it is the default.',
  oklch: 'Rotations happen on the perceptual wheel, where equal angles look equally different. Mathematically the most even, but blue’s complement lands on yellow, which can feel wrong.',
  hsl: 'The raw RGB wheel used by hsl(). Fast and familiar, but its hues are unevenly spaced — the greens occupy a huge arc while the yellows are squeezed into a sliver.',
}
export const HARMONY_IDS

### app/lib/color/scale.ts
export type ScalePreset
export type ScaleMode
export interface ScaleStop
  key: string
  color: Oklch
  contrast: number
  meetsTarget: boolean
  purpose: string
}
export interface ScaleOptions
  preset: ScalePreset
  mode: ScaleMode
  steps: number
  lightEnd: number
  darkEnd: number
  anchor: number | null
  chromaFalloff: number
  curve: number
  background: ColorInput
  metric: ContrastMetric
  targets: number[] | null
  gamut: GamutStrategy
  pinSeed: boolean
}
export const TAILWIND_KEYS
export const RADIX_KEYS
export const MATERIAL_KEYS
export const RADIX_PURPOSES: Record<string, string>
}
export const TAILWIND_PURPOSES: Record<string, string>
}
export const DEFAULT_SCALE_OPTIONS: ScaleOptions
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
export const TAILWIND_CONTRAST_TARGETS
export const RADIX_CONTRAST_TARGETS
}
}
}
}
  hue: number,
  chroma: number,
  target: number,
  options: ScaleOptions,
  preferDark: boolean,
}
export function generateScale(seed: ColorInput, options: Partial<ScaleOptions>
}
export function generateNeutralScale(
  seed: ColorInput,
  options: Partial<ScaleOptions>
}
export const SCALE_MODE_HINTS: Record<ScaleMode, string>
}
export const SCALE_PRESET_HINTS: Record<ScalePreset, string>
  custom: 'Pick your own number of steps. Useful for compact scales (5 steps) or very fine ramps (20+).',
}

### app/lib/color/invert.ts
export type InvertStrategy =
export interface InvertOptions
  strategy: InvertStrategy
  darkFloor: number
  darkCeiling: number
  chromaCompensation: number
  accentBoost: number
  lightBackground: ColorInput
  darkBackground: ColorInput
  metric: ContrastMetric
  gamut: GamutStrategy
}
export const DEFAULT_INVERT_OPTIONS: InvertOptions
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
}
}
}
}
  color: Oklch,
  options: InvertOptions,
}
export function toDark(color: ColorInput, options: Partial<InvertOptions>
}
export function toLight(color: ColorInput, options: Partial<InvertOptions>
}
export interface InvertReport
  lightRatio: number
  darkRatio: number
  lightLc: number
  darkLc: number
  drift: number
}
export function reportInversion(
  light: ColorInput,
  dark: ColorInput,
  options: Partial<InvertOptions>
}
export const INVERT_LABELS: Record<InvertStrategy, string>
  radix: 'Radix-style asymmetric',
  material: 'Material 3 tonal',
  none: 'No inversion',
}
export const INVERT_HINTS: Record<InvertStrategy, string>
  none: 'Use the same color in both modes. Correct for colors that are already mode-agnostic, such as a mid-lightness brand accent that reads fine on either background.',
}

### app/lib/color/alpha.ts
export const DEFAULT_ALPHA_STEPS
export interface AlphaVariant
  alpha: number
  color: Oklch
  step: string
}
export function alphaLadder(color: ColorInput, steps: number[]
}
export function composite(fg: ColorInput, bg: ColorInput): Oklch
}
export interface SolvedAlpha
  color: Oklch
  alpha: number
  error: number
  exact: boolean
}
export function solveAlpha(target: ColorInput, background: ColorInput): SolvedAlpha
}
export function alphaScaleFrom(steps: ColorInput[], background: ColorInput): SolvedAlpha[]
}
export function overlayLadder(background: ColorInput, steps: number[]
}
export const ALPHA_MODE_HINTS
} as const

### app/lib/color/contrast.ts
export function luminance(color: ColorInput): number
}
export function wcag(a: ColorInput, b: ColorInput): number
}
export type WcagLevel
export function wcagLevel(ratio: number, large
}
export function passesNonText(ratio: number): boolean
}
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
}
}
export function apca(text: ColorInput, background: ColorInput): number
}
export function apcaVerdict(lc: number): { label: string; use: string; ok: boolean }
}
export type ContrastMetric
export function score(text: ColorInput, background: ColorInput, metric: ContrastMetric): number
}
export function bestBlackOrWhite(background: ColorInput, metric: ContrastMetric
}
export function bestForeground(
  background: ColorInput,
  candidates: ColorInput[],
  metric: ContrastMetric
}
export interface ReadableOptions
  target?: number
  metric?: ContrastMetric
  preserveHue?: boolean
}
export function makeReadable(
  color: ColorInput,
  background: ColorInput,
  options: ReadableOptions
}
export function contrastMatrix(colors: ColorInput[], metric: ContrastMetric
}
export const METRIC_HINTS: Record<ContrastMetric, string>
  wcag: 'The ratio defined by WCAG 2.x, from 1:1 to 21:1. It is what accessibility audits and most legislation still measure, so you usually have to satisfy it. Its weakness is well documented: it over-rates dark backgrounds and under-rates mid-tone pairs, and it ignores font size and weight entirely.',
  apca: 'The perceptual contrast algorithm developed for WCAG 3. It reports Lc values from roughly -108 to 106 and accounts for polarity — light-on-dark and dark-on-light are scored differently, because the eye treats them differently. It maps directly onto usable font sizes and weights. Not yet a legal standard, but a far better predictor of whether text is actually readable.',
}

### app/lib/color/cvd.ts
export type CvdType =
  id: CvdType
  label: string
  prevalence: string
  hint: string
  table: readonly Matrix9[] | null
  severity: number
}
export const CVD_TYPES: Record<CvdType, CvdDef>
  none:
  protanopia:
  protanomaly:
  deuteranopia:
  deuteranomaly:
  tritanopia:
  tritanomaly:
  achromatopsia:
  achromatomaly:
}
export const CVD_IDS
export const CVD_AUDIT_SET: CvdType[]
}
export function simulate(color: ColorInput, type: CvdType): Oklch
}
export function simulatePalette(colors: ColorInput[], type: CvdType): Oklch[]
}
export function svgMatrixFor(type: CvdType): number[]
}
export interface CvdCollision
  a: number
  b: number
  type: CvdType
  distance: number
  originalDistance: number
}
export function findCollisions(colors: ColorInput[], threshold
}
export function cvdSafetyScore(colors: ColorInput[], threshold
}

### app/lib/color/name.ts
  max: number
  name: string
}
}
}
}
export function describeColor(color: ColorInput): string
}
export function familyOf(color: ColorInput): string
}
  names: string[]
  lab: Float32Array
}
export function loadNameIndex(): Promise<NameIndex>
}
export interface NamedColor
  name: string
  distance: number
}
export async function nearestName(color: ColorInput): Promise<NamedColor>
}
export async function nearestNames(color: ColorInput, n
}
export async function searchNames(query: string, limit
}
export async function colorForName(index: number): Promise<Oklch>
}
export function slugify(input: string): string
}
export function uniqueSlugs(labels: string[]): string[]
}
export function distance(a: ColorInput, b: ColorInput): number
}

### app/lib/color/extract.ts
export type ExtractAlgorithm
export interface ExtractOptions
  algorithm: ExtractAlgorithm
  count: number
  sampleSize: number
  minLightness: number
  maxLightness: number
  minChroma: number
  sort: 'lightness' | 'chroma' | 'hue' | 'population' | 'none'
  seed: number
}
export const DEFAULT_EXTRACT_OPTIONS: ExtractOptions
  algorithm: 'kmeans',
  count: 5,
  sampleSize: 220,
  minLightness: 0.06,
  maxLightness: 0.985,
  minChroma: 0.008,
  sort: 'lightness',
  seed: 0xc010f,
}
export interface ExtractedColor
  color: Oklch
  population: number
}
  l: number
  a: number
  b: number
}
export async function samplePixels(
  source: HTMLImageElement | ImageBitmap | Blob,
  options: Partial<ExtractOptions>
}
}
}
}
}
}
export async function extractPalette(
  source: HTMLImageElement | ImageBitmap | Blob,
  options: Partial<ExtractOptions>
}
export function pickAt(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
}
export const ALGORITHM_LABELS: Record<ExtractAlgorithm, string>
  kmeans: 'k-means clustering',
  vibrant: 'Vibrant',
}
export const ALGORITHM_HINTS: Record<ExtractAlgorithm, string>
}
export const EXTRACT_SORT_HINTS: Record<ExtractOptions['sort'], string>
  lightness: 'Light to dark. Reads as a designed palette and makes the light/dark ends obvious.',
  chroma: 'Most colorful first. Puts the accents at the front and the neutrals at the back.',
  hue: 'Around the color wheel. Best for spotting which hue families the image actually uses.',
  population: 'Most of the image first. Shows you the true weighting of the photo.',
  none: 'Whatever order the algorithm produced.',
}

### app/lib/color/roles.ts
export type RoleKey =
export interface RoleValue
  color: Oklch
  source: number
  derived: boolean
}
export interface RoleMap extends Record<RoleKey, RoleValue>
  chart: RoleValue[]
  ramp: RoleValue[]
  scheme: 'light' | 'dark'
}
export interface RoleOptions
  scheme: 'light' | 'dark' | 'auto'
  metric: ContrastMetric
  textTarget: number
  uiTarget: number
  derive: number
  chartCount: number
}
export const DEFAULT_ROLE_OPTIONS: RoleOptions
  scheme: 'auto',
  metric: 'apca',
  textTarget: 75,
  uiTarget: 45,
  derive: 1,
  chartCount: 6,
}
}
}
export function mix(a: ColorInput, b: ColorInput, amount: number): Oklch
}
export function assignRoles(palette: ColorInput[], options: Partial<RoleOptions>
}
export function rolesToCssVars(roles: RoleMap, format: (c: ColorInput) => string): Record<string, string>
}
export interface RoleAudit
  key: string
  message: string
  severity: 'error' | 'warning'
}
export function auditRoles(roles: RoleMap): RoleAudit[]
}

### app/lib/color/gradient.ts
export function channelGradient(
  space: SpaceId,
  channelKey: string,
  others: Record<string, number>,
}
export function gamutGaps(
  space: SpaceId,
  channelKey: string,
  others: Record<string, number>,
}
export function rangeMidpoint(min: number, max: number, cyclic: boolean, wrapAt: number): number
}
export function paletteGradient(colors: Array<{ l?: number; c?: number; h?: number }>): string
}

### app/lib/theme/tokens.ts
export type TokenGroup =
export interface TokenDef
  key: string
  label: string
  group: TokenGroup
  kind: 'color' | 'font' | 'length' | 'number'
  hint: string
  contrastAgainst?: string | null
  themeAlias?: string
}
export const COLOR_TOKENS: TokenDef[]
export const NON_COLOR_TOKENS: TokenDef[]
export const ALL_TOKENS: TokenDef[]
export const TOKEN_BY_KEY: Record<string, TokenDef>
export const COLOR_TOKEN_KEYS
export const GROUP_LABELS: Record<TokenGroup, string>
  base: 'Base',
  card: 'Card',
  popover: 'Popover',
  primary: 'Primary',
  secondary: 'Secondary',
  muted: 'Muted',
  accent: 'Accent',
  destructive: 'Destructive',
  border: 'Borders & focus',
  chart: 'Charts',
  sidebar: 'Sidebar',
  typography: 'Typography',
  shape: 'Shape & spacing',
  shadow: 'Shadow',
}
export type TokenValues
export interface ThemeDefinition
  id: string
  name: string
  author?: string
  light: TokenValues
  dark: TokenValues
}
  offsetY: number
  blur: number
  opacityMultiplier: number
  spreadDelta: number
}
  xs: { layers: [{ offsetY: 0, blur: 0, opacityMultiplier: 0.5, spreadDelta: 0 }] },
  sm:
  DEFAULT:
  md:
  lg:
  xl:
}
export const SHADOW_KEYS
}
export function deriveShadows(values: TokenValues): Record<string, string>
}
export const RADIUS_STEPS: Array<[name: string, multiplier: number]>
export const TRACKING_STEPS: Array<[name: string, offsetEm: number]>

### app/lib/palette/url.ts
export interface PaletteState
  colors: Oklch[]
  locks: boolean[]
  names: string[]
  seed?: number | null
  extra?: Record<string, unknown>
}
}
}
}
}
}
export function encodeHexList(colors: Oklch[]): string
}
export async function encodeState(state: PaletteState): Promise<string>
}
export async function decodeState(value: string): Promise<PaletteState | null>
}
export async function readFromLocation(): Promise<PaletteState | null>
}

