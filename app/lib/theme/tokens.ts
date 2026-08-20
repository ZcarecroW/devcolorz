/**
 * The shadcn / tweakcn token contract.
 *
 * One list serves three jobs:
 *   1. it defines DevColorz's own themeable surface (the app is themed with
 *      exactly the tokens it exports, so the theme editor previews itself),
 *   2. it drives the theme-editor UI, and
 *   3. it is the target shape of the shadcn export.
 *
 * The set is tweakcn's 45-key superset of shadcn's 30 colors. Emitting the
 * extra keys is harmless in stock shadcn and necessary for tweakcn preset
 * parity, so we always emit all of them.
 */

export type TokenGroup =
  | 'base'
  | 'card'
  | 'popover'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'destructive'
  | 'border'
  | 'chart'
  | 'sidebar'
  | 'typography'
  | 'shape'
  | 'shadow'

export interface TokenDef {
  /** CSS custom property name without the leading dashes. */
  key: string
  label: string
  group: TokenGroup
  /** `color` tokens are editable in the color picker; the rest are text/number. */
  kind: 'color' | 'font' | 'length' | 'number'
  /** Explains what the token controls, surfaced as a tooltip. */
  hint: string
  /**
   * The token whose contrast this one is checked against, when it is a
   * foreground. `null` means it is not a foreground.
   */
  contrastAgainst?: string | null
  /** Tailwind v4 `@theme inline` alias, when one exists. */
  themeAlias?: string
}

export const COLOR_TOKENS: TokenDef[] = [
  { key: 'background', label: 'Background', group: 'base', kind: 'color', themeAlias: '--color-background', hint: 'The page canvas. Everything else sits on top of this, so it is decided first and every contrast check refers back to it.' },
  { key: 'foreground', label: 'Foreground', group: 'base', kind: 'color', themeAlias: '--color-foreground', contrastAgainst: 'background', hint: 'Default body text. Needs the strongest contrast in the whole theme — APCA Lc 75 or better against the background.' },

  { key: 'card', label: 'Card', group: 'card', kind: 'color', themeAlias: '--color-card', hint: 'Raised surfaces: cards, panels, dialogs. Usually a small step away from the background rather than a different colour.' },
  { key: 'card-foreground', label: 'Card text', group: 'card', kind: 'color', themeAlias: '--color-card-foreground', contrastAgainst: 'card', hint: 'Text on cards. Normally identical to the main foreground; give it its own value only when your card surface differs enough to need it.' },

  { key: 'popover', label: 'Popover', group: 'popover', kind: 'color', themeAlias: '--color-popover', hint: 'Floating surfaces: dropdowns, tooltips, command palettes. Often slightly more opaque or lighter than a card so it reads as being above the page.' },
  { key: 'popover-foreground', label: 'Popover text', group: 'popover', kind: 'color', themeAlias: '--color-popover-foreground', contrastAgainst: 'popover', hint: 'Text inside floating surfaces.' },

  { key: 'primary', label: 'Primary', group: 'primary', kind: 'color', themeAlias: '--color-primary', contrastAgainst: 'background', hint: 'The brand colour. Fills the default button and marks the main action on a screen. Should clear Lc 45 against the background so the button itself is visible, independently of its label.' },
  { key: 'primary-foreground', label: 'On primary', group: 'primary', kind: 'color', themeAlias: '--color-primary-foreground', contrastAgainst: 'primary', hint: 'Label text on the primary fill. This is the pair that breaks most hand-made themes: a mid-lightness brand colour where neither white nor black quite works.' },

  { key: 'secondary', label: 'Secondary', group: 'secondary', kind: 'color', themeAlias: '--color-secondary', hint: 'Quieter button and chip fills. Usually a neutral tinted with the brand hue rather than a second brand colour.' },
  { key: 'secondary-foreground', label: 'On secondary', group: 'secondary', kind: 'color', themeAlias: '--color-secondary-foreground', contrastAgainst: 'secondary', hint: 'Label text on secondary fills.' },

  { key: 'muted', label: 'Muted', group: 'muted', kind: 'color', themeAlias: '--color-muted', hint: 'Low-emphasis backgrounds: table stripes, disabled fills, skeleton loaders.' },
  { key: 'muted-foreground', label: 'Muted text', group: 'muted', kind: 'color', themeAlias: '--color-muted-foreground', contrastAgainst: 'background', hint: 'Secondary text: captions, help text, placeholders. Deliberately lower contrast than the foreground, but it is still text — keep it above Lc 60 or you have made it decoration.' },

  { key: 'accent', label: 'Accent', group: 'accent', kind: 'color', themeAlias: '--color-accent', hint: 'Hover and highlight fills for menu items, list rows and toggles. Not a second brand colour — it is the "something is happening here" tint.' },
  { key: 'accent-foreground', label: 'On accent', group: 'accent', kind: 'color', themeAlias: '--color-accent-foreground', contrastAgainst: 'accent', hint: 'Text on accent fills, typically on a hovered menu item.' },

  { key: 'destructive', label: 'Destructive', group: 'destructive', kind: 'color', themeAlias: '--color-destructive', contrastAgainst: 'background', hint: 'Delete buttons, error states, validation failures. Red by convention, and worth checking under protanopia, where red can collapse into the greens.' },
  { key: 'destructive-foreground', label: 'On destructive', group: 'destructive', kind: 'color', themeAlias: '--color-destructive-foreground', contrastAgainst: 'destructive', hint: 'Label text on destructive fills. Absent from stock shadcn but present in tweakcn presets, so we always emit it — it is harmless where it is unused.' },

  { key: 'border', label: 'Border', group: 'border', kind: 'color', themeAlias: '--color-border', contrastAgainst: 'background', hint: 'Default hairlines and dividers. Aim for Lc 15–25 against the background: visible without drawing attention.' },
  { key: 'input', label: 'Input border', group: 'border', kind: 'color', themeAlias: '--color-input', contrastAgainst: 'background', hint: 'The outline of form fields. WCAG requires 3:1 for the boundary of an interactive control, so this usually needs more contrast than a plain border.' },
  { key: 'ring', label: 'Focus ring', group: 'border', kind: 'color', themeAlias: '--color-ring', contrastAgainst: 'background', hint: 'The keyboard focus indicator. Never remove it, and never make it subtle — for keyboard users it is the only cursor they have.' },

  { key: 'chart-1', label: 'Chart 1', group: 'chart', kind: 'color', themeAlias: '--color-chart-1', hint: 'First data series. The chart ramp is ordered for maximum perceptual separation between neighbours, not by hue.' },
  { key: 'chart-2', label: 'Chart 2', group: 'chart', kind: 'color', themeAlias: '--color-chart-2', hint: 'Second data series.' },
  { key: 'chart-3', label: 'Chart 3', group: 'chart', kind: 'color', themeAlias: '--color-chart-3', hint: 'Third data series.' },
  { key: 'chart-4', label: 'Chart 4', group: 'chart', kind: 'color', themeAlias: '--color-chart-4', hint: 'Fourth data series.' },
  { key: 'chart-5', label: 'Chart 5', group: 'chart', kind: 'color', themeAlias: '--color-chart-5', hint: 'Fifth data series.' },

  { key: 'sidebar', label: 'Sidebar', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar', hint: 'Navigation rail background. Often a darker or more saturated surface than the page, to separate navigation from content.' },
  { key: 'sidebar-foreground', label: 'Sidebar text', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-foreground', contrastAgainst: 'sidebar', hint: 'Navigation label text.' },
  { key: 'sidebar-primary', label: 'Sidebar primary', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-primary', contrastAgainst: 'sidebar', hint: 'The active navigation item’s fill.' },
  { key: 'sidebar-primary-foreground', label: 'On sidebar primary', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-primary-foreground', contrastAgainst: 'sidebar-primary', hint: 'Text on the active navigation item.' },
  { key: 'sidebar-accent', label: 'Sidebar accent', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-accent', hint: 'Hover fill for navigation items.' },
  { key: 'sidebar-accent-foreground', label: 'On sidebar accent', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-accent-foreground', contrastAgainst: 'sidebar-accent', hint: 'Text on hovered navigation items.' },
  { key: 'sidebar-border', label: 'Sidebar border', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-border', contrastAgainst: 'sidebar', hint: 'Dividers inside the navigation rail.' },
  { key: 'sidebar-ring', label: 'Sidebar ring', group: 'sidebar', kind: 'color', themeAlias: '--color-sidebar-ring', contrastAgainst: 'sidebar', hint: 'Focus indicator inside the navigation rail.' },
]

export const NON_COLOR_TOKENS: TokenDef[] = [
  { key: 'font-sans', label: 'Sans font', group: 'typography', kind: 'font', themeAlias: '--font-sans', hint: 'The interface font stack. Always end with a generic family so text still renders if a webfont fails.' },
  { key: 'font-serif', label: 'Serif font', group: 'typography', kind: 'font', themeAlias: '--font-serif', hint: 'Used for editorial and long-form previews.' },
  { key: 'font-mono', label: 'Mono font', group: 'typography', kind: 'font', themeAlias: '--font-mono', hint: 'Code, hex values and anything that should line up in columns.' },
  { key: 'letter-spacing', label: 'Letter spacing', group: 'typography', kind: 'length', hint: 'Global tracking adjustment. Small negative values tighten large headings; positive values open up small caps and all-caps labels.' },
  { key: 'radius', label: 'Radius', group: 'shape', kind: 'length', hint: 'The base corner radius. Every other radius is a multiple of it, so one value re-shapes the whole interface.' },
  { key: 'spacing', label: 'Spacing unit', group: 'shape', kind: 'length', hint: 'The base spacing step Tailwind multiplies for every padding and margin utility. 0.25rem is the default; raising it makes the whole interface roomier.' },
  { key: 'shadow-color', label: 'Shadow colour', group: 'shadow', kind: 'color', hint: 'The colour shadows are tinted with. A shadow tinted toward the brand hue looks intentional; pure black looks like a default.' },
  { key: 'shadow-opacity', label: 'Shadow opacity', group: 'shadow', kind: 'number', hint: 'Base alpha for shadows. Each size multiplies this, so one value controls the whole elevation ramp.' },
  { key: 'shadow-blur', label: 'Shadow blur', group: 'shadow', kind: 'length', hint: 'Base blur radius. Larger values read as a softer, higher light source.' },
  { key: 'shadow-spread', label: 'Shadow spread', group: 'shadow', kind: 'length', hint: 'Base spread. Negative values pull the shadow in tight under the element.' },
  { key: 'shadow-offset-x', label: 'Shadow offset X', group: 'shadow', kind: 'length', hint: 'Horizontal offset. Usually zero — light normally comes from above, not from the side.' },
  { key: 'shadow-offset-y', label: 'Shadow offset Y', group: 'shadow', kind: 'length', hint: 'Vertical offset. Positive values push the shadow downward, implying a light source above.' },
]

export const ALL_TOKENS: TokenDef[] = [...COLOR_TOKENS, ...NON_COLOR_TOKENS]

export const TOKEN_BY_KEY: Record<string, TokenDef> = Object.fromEntries(
  ALL_TOKENS.map((t) => [t.key, t]),
)

export const COLOR_TOKEN_KEYS = COLOR_TOKENS.map((t) => t.key)

export const GROUP_LABELS: Record<TokenGroup, string> = {
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

/** A complete theme: one value per token, for one mode. */
export type TokenValues = Record<string, string>

export interface ThemeDefinition {
  id: string
  name: string
  /** Where it came from, shown in the preset picker. */
  author?: string
  light: TokenValues
  dark: TokenValues
}

/* ------------------------------------------------------------------ *
 * Shadow derivation
 * ------------------------------------------------------------------ */

interface ShadowLayer {
  offsetY: number
  blur: number
  opacityMultiplier: number
  spreadDelta: number
}

/**
 * The eight `--shadow-*` values are derived from the six shadow inputs, using
 * tweakcn's exact algorithm so that a theme exported from here and pasted into
 * tweakcn round-trips unchanged.
 */
const SHADOW_SIZES: Record<string, { layers: ShadowLayer[] }> = {
  '2xs': { layers: [{ offsetY: 0, blur: 0, opacityMultiplier: 0.5, spreadDelta: 0 }] },
  xs: { layers: [{ offsetY: 0, blur: 0, opacityMultiplier: 0.5, spreadDelta: 0 }] },
  sm: {
    layers: [
      { offsetY: 0, blur: 0, opacityMultiplier: 1, spreadDelta: 0 },
      { offsetY: 1, blur: 2, opacityMultiplier: 1, spreadDelta: -1 },
    ],
  },
  DEFAULT: {
    layers: [
      { offsetY: 0, blur: 0, opacityMultiplier: 1, spreadDelta: 0 },
      { offsetY: 1, blur: 2, opacityMultiplier: 1, spreadDelta: -1 },
    ],
  },
  md: {
    layers: [
      { offsetY: 0, blur: 0, opacityMultiplier: 1, spreadDelta: 0 },
      { offsetY: 2, blur: 4, opacityMultiplier: 1, spreadDelta: -1 },
    ],
  },
  lg: {
    layers: [
      { offsetY: 0, blur: 0, opacityMultiplier: 1, spreadDelta: 0 },
      { offsetY: 4, blur: 6, opacityMultiplier: 1, spreadDelta: -1 },
    ],
  },
  xl: {
    layers: [
      { offsetY: 0, blur: 0, opacityMultiplier: 1, spreadDelta: 0 },
      { offsetY: 8, blur: 10, opacityMultiplier: 1, spreadDelta: -1 },
    ],
  },
  '2xl': { layers: [{ offsetY: 0, blur: 0, opacityMultiplier: 2.5, spreadDelta: 0 }] },
}

export const SHADOW_KEYS = ['2xs', 'xs', 'sm', 'DEFAULT', 'md', 'lg', 'xl', '2xl'] as const

function px(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/** Build the eight derived shadow values from a theme's shadow inputs. */
export function deriveShadows(values: TokenValues): Record<string, string> {
  const color = values['shadow-color'] ?? 'oklch(0 0 0)'
  const opacity = px(values['shadow-opacity'] ?? '0.1')
  const blur = px(values['shadow-blur'] ?? '3')
  const spread = px(values['shadow-spread'] ?? '0')
  const offsetX = px(values['shadow-offset-x'] ?? '0')
  const offsetY = px(values['shadow-offset-y'] ?? '1')

  const out: Record<string, string> = {}
  for (const size of SHADOW_KEYS) {
    const def = SHADOW_SIZES[size]
    out[size] = def.layers
      .map((layer, index) => {
        const alpha = Math.min(1, Math.max(0, opacity * layer.opacityMultiplier))
        const y = index === 0 ? offsetY : layer.offsetY
        const b = index === 0 ? blur : layer.blur
        const s = spread + layer.spreadDelta
        return `${offsetX}px ${y}px ${b}px ${s}px color-mix(in oklab, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`
      })
      .join(', ')
  }
  return out
}

/**
 * Radius multipliers used by `@theme inline`.
 *
 * The older shadcn form was `calc(var(--radius) - 4px)`, which breaks as soon
 * as the base radius drops below 4px — you get negative radii. The multiplier
 * form scales cleanly at every base value, so it is what we emit, and imports
 * using the subtraction form are upgraded on the way in.
 */
export const RADIUS_STEPS: Array<[name: string, multiplier: number]> = [
  ['xs', 0.6],
  ['sm', 0.8],
  ['md', 1],
  ['lg', 1.4],
  ['xl', 1.8],
  ['2xl', 2.2],
  ['3xl', 2.6],
]

export const TRACKING_STEPS: Array<[name: string, offsetEm: number]> = [
  ['tighter', -0.05],
  ['tight', -0.025],
  ['normal', 0],
  ['wide', 0.025],
  ['wider', 0.05],
  ['widest', 0.1],
]
