/**
 * The token graph.
 *
 * One intermediate representation, many emitters. Everything that decides
 * *what* the export contains happens here — names, dark counterparts, alpha
 * variants, tonal scales — so a new output format is a pure formatting problem
 * and cannot accidentally change the token set.
 */

import { alphaLadder, overlayLadder, solveAlpha } from '@/lib/color/alpha'
import { apca, wcag } from '@/lib/color/contrast'
import { toDark } from '@/lib/color/invert'
import { slugify, uniqueSlugs } from '@/lib/color/name'
import { generateScale } from '@/lib/color/scale'
import type { Oklch, Swatch } from '@/lib/color/types'
import type { ExportConfig, NameCase } from './config'

export type TokenKind = 'base' | 'scale' | 'alpha'

export interface TokenMeta {
  /** WCAG ratio against white and black, for the export's comments. */
  contrastOnWhite: number
  contrastOnBlack: number
  apcaOnWhite: number
  apcaOnBlack: number
}

export interface Token {
  /** Stable identity: `brand`, `brand-500`, `brand-a20`. */
  id: string
  /** Name in the configured case, without prefix or suffix. */
  name: string
  kind: TokenKind
  /** The colour in light mode. */
  light: Oklch
  /** The dark-mode counterpart, when one was requested. */
  dark: Oklch | null
  /** The swatch this token descends from. */
  sourceId: string
  /** Human note emitted as a comment. */
  comment?: string
  meta: TokenMeta
}

export interface TokenGraph {
  tokens: Token[]
  /** True when at least one token carries a dark value. */
  hasDark: boolean
  config: ExportConfig
  /** Title of the palette, used in file headers. */
  title: string
}

/* ------------------------------------------------------------------ *
 * Naming
 * ------------------------------------------------------------------ */

/** Re-case a kebab slug into the configured convention. */
export function applyCase(slug: string, style: NameCase): string {
  const parts = slug.split('-').filter(Boolean)
  switch (style) {
    case 'camel':
      return parts
        .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('')
    case 'pascal':
      return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
    case 'snake':
      return parts.join('_')
    case 'constant':
      return parts.join('_').toUpperCase()
    case 'kebab':
    default:
      return parts.join('-')
  }
}

/**
 * Join prefix, stem and suffix in the configured case.
 *
 * Consecutive identical segments collapse. The default prefix is `color` and
 * the default fallback stem is also `color`, so an unnamed swatch would
 * otherwise emit `--color-color-1` — which looks like a bug in the tool, and
 * would be one.
 */
export function composeName(config: ExportConfig, stem: string, ...parts: string[]): string {
  const segments: string[] = []
  for (const part of [config.prefix, stem, ...parts, config.suffix]) {
    if (!part) continue
    const slug = slugify(String(part))
    if (!slug) continue
    for (const piece of slug.split('-')) {
      if (piece && segments[segments.length - 1] !== piece) segments.push(piece)
    }
  }
  return applyCase(segments.join('-'), config.case)
}

/**
 * Stable, unique stems for the palette.
 *
 * Two swatches called "Blue" would otherwise emit the same custom property and
 * one would silently win, which is the kind of bug that survives to production.
 */
export function stemsFor(swatches: Swatch[], config: ExportConfig): string[] {
  const labels = swatches.map((swatch, index) => {
    const override = config.overrides[swatch.id]?.name
    const source = override ?? (config.useNames ? swatch.name : '')
    return source?.trim() ? source : `${config.fallbackStem}-${index + 1}`
  })
  return uniqueSlugs(labels)
}

/* ------------------------------------------------------------------ *
 * Graph construction
 * ------------------------------------------------------------------ */

const WHITE: Oklch = { mode: 'oklch', l: 1, c: 0, h: 0 }
const BLACK: Oklch = { mode: 'oklch', l: 0, c: 0, h: 0 }

function metaFor(color: Oklch): TokenMeta {
  return {
    contrastOnWhite: wcag(color, WHITE),
    contrastOnBlack: wcag(color, BLACK),
    apcaOnWhite: apca(color, WHITE),
    apcaOnBlack: apca(color, BLACK),
  }
}

function darkFor(color: Oklch, config: ExportConfig, override?: Oklch | null): Oklch | null {
  if (override) return override
  return toDark(color, {
    strategy: config.darkStrategy,
    darkFloor: config.darkFloor,
    darkCeiling: config.darkCeiling,
    chromaCompensation: config.chromaCompensation,
  })
}

/** Should this swatch produce a dark counterpart? */
function wantsDark(swatchId: string, config: ExportConfig): boolean {
  const override = config.overrides[swatchId]
  if (override?.dark !== undefined) return override.dark
  return config.emitDark
}

function wantsAlpha(swatchId: string, config: ExportConfig): boolean {
  const override = config.overrides[swatchId]
  if (override?.alpha !== undefined) return override.alpha
  return config.emitAlpha
}

function wantsScale(swatchId: string, config: ExportConfig): boolean {
  const override = config.overrides[swatchId]
  if (override?.scale !== undefined) return override.scale
  return config.emitScales
}

export function buildGraph(
  swatches: Swatch[],
  config: ExportConfig,
  title = 'Palette',
): TokenGraph {
  const included = swatches.filter((s) => !config.overrides[s.id]?.exclude)
  const stems = stemsFor(included, config)

  const ordered = included
    .map((swatch, index) => ({ swatch, stem: stems[index] }))
    .sort((a, b) => {
      if (config.sortBy === 'name') return a.stem.localeCompare(b.stem)
      if (config.sortBy === 'lightness') return (b.swatch.color.l ?? 0) - (a.swatch.color.l ?? 0)
      return 0
    })

  const tokens: Token[] = []
  let hasDark = false

  for (const { swatch, stem } of ordered) {
    const emitDark = wantsDark(swatch.id, config)
    const dark = emitDark
      ? darkFor(swatch.color, config, config.overrides[swatch.id]?.darkColor)
      : null
    if (dark) hasDark = true

    tokens.push({
      id: stem,
      name: composeName(config, stem),
      kind: 'base',
      light: swatch.color,
      dark,
      sourceId: swatch.id,
      comment: swatch.name || undefined,
      meta: metaFor(swatch.color),
    })

    if (wantsScale(swatch.id, config)) {
      const steps = generateScale(swatch.color, {
        preset: config.scalePreset,
        mode: config.scaleMode,
        steps: config.scaleSteps,
      })
      const darkSteps = emitDark
        ? generateScale(dark ?? swatch.color, {
            preset: config.scalePreset,
            mode: config.scaleMode,
            steps: config.scaleSteps,
          })
        : null
      steps.forEach((step, index) => {
        tokens.push({
          id: `${stem}-${step.key}`,
          name: composeName(config, stem, step.key),
          kind: 'scale',
          light: step.color,
          dark: darkSteps ? darkSteps[index].color : null,
          sourceId: swatch.id,
          comment: step.purpose || undefined,
          meta: metaFor(step.color),
        })
      })
    }

    if (wantsAlpha(swatch.id, config)) {
      const fractions = config.alphaSteps.map((step) => step / 100)
      const variants =
        config.alphaMode === 'overlay'
          ? overlayLadder(swatch.color, fractions)
          : config.alphaMode === 'solved'
            ? fractions.map((alpha) => {
                // Solve against the colour composited over white at this
                // opacity, so the alpha token reproduces the flat tint you
                // would have got — but keeps working over any background.
                const target: Oklch = {
                  mode: 'oklch',
                  l: (swatch.color.l ?? 0) * alpha + 1 * (1 - alpha),
                  c: (swatch.color.c ?? 0) * alpha,
                  h: swatch.color.h ?? 0,
                }
                const solved = solveAlpha(target, WHITE)
                return { alpha: solved.alpha, color: solved.color, step: String(Math.round(alpha * 100)) }
              })
            : alphaLadder(swatch.color, fractions)

      for (const variant of variants) {
        tokens.push({
          id: `${stem}-a${variant.step}`,
          name: composeName(config, stem, `a${variant.step}`),
          kind: 'alpha',
          light: variant.color,
          dark: emitDark && dark ? { ...dark, alpha: variant.color.alpha } : null,
          sourceId: swatch.id,
          comment: `${variant.step}% opacity`,
          meta: metaFor(variant.color),
        })
      }
    }
  }

  return { tokens, hasDark, config, title }
}

/** Group tokens by the swatch they came from — used by several emitters. */
export function groupBySource(graph: TokenGraph): Map<string, Token[]> {
  const map = new Map<string, Token[]>()
  for (const token of graph.tokens) {
    const list = map.get(token.sourceId)
    if (list) list.push(token)
    else map.set(token.sourceId, [token])
  }
  return map
}
