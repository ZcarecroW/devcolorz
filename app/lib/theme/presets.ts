/**
 * Built-in themes for the DevColorz interface itself.
 *
 * The app is themed with exactly the token set it exports, so the theme editor
 * is previewing itself at all times: change `--primary` and the button you
 * clicked to change it repaints. That is the honest way to build a theme
 * editor, and it is why these values are written in OKLCH rather than hex.
 */

import type { ThemeDefinition, TokenValues } from './tokens'

import signal from './signal.json'

/**
 * The default theme lives in `signal.json` rather than in this file, because
 * `scripts/gen-theme-css.mjs` reads the same file to emit the stylesheet that
 * paints the first frame. Two copies of these numbers would drift within a
 * week.
 */
const signalLight = signal.light as TokenValues
const signalDark = signal.dark as TokenValues

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/**
 * Re-hue a theme, keeping every lightness and chroma relationship intact.
 * `shift` rotates every chromatic token; near-neutral tokens are re-tinted so
 * the greys stay in the same family as the accent.
 */
function rehue(values: TokenValues, shift: number, chromaScale = 1): TokenValues {
  const out: TokenValues = { ...values }
  for (const [key, value] of Object.entries(values)) {
    const match = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.-]+)\)$/.exec(value)
    if (!match) continue
    const l = Number(match[1])
    const c = Number(match[2])
    const h = Number(match[3])
    if (c < 0.0005) continue
    const nextC = Math.max(0, c * (c > 0.03 ? chromaScale : 1))
    const nextH = ((h + shift) % 360 + 360) % 360
    out[key] = `oklch(${l} ${Number(nextC.toFixed(4))} ${Number(nextH.toFixed(2))})`
  }
  return out
}

const CHART_KEYS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

/**
 * Drop every colour to its lightness.
 *
 * The chart tokens need their own ramp afterwards. In the source theme the
 * five of them are separated by hue and chroma, not by lightness — dropping
 * those left chart-1 and chart-4 six ten-thousandths of an L apart, which is
 * one grey wearing two names, and a bar chart with two provably identical
 * series. `chartRamp` is the lightness band they are respread across; it has
 * to be given per mode, because the band that reads on a white surface is not
 * the one that reads on a near-black one.
 */
function grayscale(values: TokenValues, chartRamp: [number, number]): TokenValues {
  const out: TokenValues = { ...values }
  for (const [key, value] of Object.entries(values)) {
    const match = /^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.-]+)\)$/.exec(value)
    if (!match) continue
    const l = Number(match[1])
    out[key] = `oklch(${l} 0 0)`
  }

  const [from, to] = chartRamp
  const step = (to - from) / Math.max(1, CHART_KEYS.length - 1)
  CHART_KEYS.forEach((key, index) => {
    if (!(key in out)) return
    out[key] = `oklch(${Number((from + index * step).toFixed(4))} 0 0)`
  })
  return out
}

export const THEME_PRESETS: ThemeDefinition[] = [
  {
    id: 'signal',
    name: 'Signal',
    author: 'DevColorz',
    light: signalLight,
    dark: signalDark,
  },
  {
    id: 'ember',
    name: 'Ember',
    author: 'DevColorz',
    light: rehue(signalLight, 128, 1.02),
    dark: rehue(signalDark, 128, 1.02),
  },
  {
    id: 'moss',
    name: 'Moss',
    author: 'DevColorz',
    light: rehue(signalLight, -148, 0.88),
    dark: rehue(signalDark, -148, 0.88),
  },
  {
    id: 'tide',
    name: 'Tide',
    author: 'DevColorz',
    light: rehue(signalLight, -100, 0.9),
    dark: rehue(signalDark, -100, 0.9),
  },
  {
    id: 'rose',
    name: 'Rose',
    author: 'DevColorz',
    light: rehue(signalLight, 60, 0.95),
    dark: rehue(signalDark, 60, 0.95),
  },
  {
    id: 'graphite',
    name: 'Graphite',
    author: 'DevColorz',
    // Wide enough that neighbouring series are a comfortable step apart, and
    // bounded so no series merges into the surface it is drawn on.
    light: { ...grayscale(signalLight, [0.28, 0.78]), radius: '0.375rem' },
    dark: { ...grayscale(signalDark, [0.42, 0.9]), radius: '0.375rem' },
  },
]

export const DEFAULT_THEME_ID = 'signal'

export function getPreset(id: string): ThemeDefinition {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0]
}

export const DEFAULT_THEME = THEME_PRESETS[0]
