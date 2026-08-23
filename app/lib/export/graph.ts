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
  /**
   * Tokens whose emitted name collided with an earlier one and were renamed.
   *
   * Surfaced so the panel can say so: a silent rename is only marginally
   * better than a silent overwrite.
   */
  renames: Array<{ from: string; to: string }>
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
  const joined = segments.join('-')
  /*
   * A leading digit is legal in a CSS custom property and illegal almost
   * everywhere else. With the prefix cleared — which the panel offers — a
   * swatch called "1st accent" emitted `--1st-accent`, which looked fine, and
   * `$1st-accent`, `@1st-accent`, `val 1stAccent` and an Android resource
   * named `1st_accent`, none of which compile. One `n` here fixes every
   * emitter at once rather than each of them separately.
   */
  const safe = /^\d/.test(joined) ? `n${joined}` : joined
  return applyCase(safe || config.fallbackStem, config.case)
}

/**
 * Stable, unique stems for the palette.
 *
 * Two swatches called "Blue" would otherwise emit the same custom property and
 * one would silently win, which is the kind of bug that survives to production.
 */
export function stemsFor(swatches: Swatch[], config: ExportConfig): string[] {
  /*
   * The fallback number is the swatch's position in the *palette*, not in the
   * surviving list. Numbering after the exclusion filter meant that hiding one
   * unnamed colour renumbered every colour after it: what a stylesheet knew as
   * `color-3` silently became `color-2` and every rule using it resolved to a
   * different colour, with no name change to notice. Excluding leaves a gap in
   * the sequence now, which is the honest signal.
   *
   * Dedup then runs over the surviving labels only, so an excluded swatch
   * cannot consume a slug and leave a lone "Blue" emitting `blue-2`.
   */
  const excluded = swatches.map((swatch) => Boolean(config.overrides[swatch.id]?.exclude))
  const labels = swatches.map((swatch, index) => {
    const override = config.overrides[swatch.id]?.name
    const source = override ?? (config.useNames ? swatch.name : '')
    return source?.trim() ? source : `${config.fallbackStem}-${index + 1}`
  })

  const survivors = uniqueSlugs(labels.filter((_, index) => !excluded[index]))
  let next = 0
  return labels.map((label, index) => (excluded[index] ? slugify(label) : survivors[next++]))
}

/* ------------------------------------------------------------------ *
 * Graph construction
 * ------------------------------------------------------------------ */

const WHITE: Oklch = { mode: 'oklch', l: 1, c: 0, h: 0 }
const BLACK: Oklch = { mode: 'oklch', l: 0, c: 0, h: 0 }
/**
 * The surface the dark half of an export is assumed to sit on.
 *
 * Matches the dark background the inversion strategies solve against, so an
 * overlay or a solved-alpha token is derived from the same assumption in both
 * modes rather than from white in one and the brand colour in the other.
 */
const DARK_SURFACE: Oklch = { mode: 'oklch', l: 0.145, c: 0, h: 0 }

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
  const stems = stemsFor(swatches, config)

  const ordered = swatches
    .map((swatch, index) => ({ swatch, stem: stems[index] }))
    .filter(({ swatch }) => !config.overrides[swatch.id]?.exclude)
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

      /**
       * Build one ladder against a given surface.
       *
       * Both modes are surface-relative, which is exactly why the dark set has
       * to be *recomputed* rather than have the light alphas copied onto the
       * inverted colour. A neutral overlay for a light surface is black; the
       * old code emitted that same black scrim's alpha carried on the dark
       * brand colour, so a scrim that was a neutral wash in light mode became
       * a translucent purple one at night. Solved alpha had the same problem:
       * it was solved against white and then shown over a dark surface.
       */
      const ladderFor = (color: Oklch, surface: Oklch) => {
        if (config.alphaMode === 'overlay') return overlayLadder(surface, fractions)
        if (config.alphaMode === 'solved') {
          return fractions.map((alpha) => {
            // Solve against the colour composited over the surface at this
            // opacity, so the alpha token reproduces the flat tint you would
            // have got — but keeps working over any background.
            const target: Oklch = {
              mode: 'oklch',
              l: (color.l ?? 0) * alpha + (surface.l ?? 1) * (1 - alpha),
              c: (color.c ?? 0) * alpha,
              h: color.h ?? 0,
            }
            const solved = solveAlpha(target, surface)
            return { alpha: solved.alpha, color: solved.color, step: String(Math.round(alpha * 100)) }
          })
        }
        return alphaLadder(color, fractions)
      }

      const variants = ladderFor(swatch.color, WHITE)
      const darkVariants = emitDark && dark ? ladderFor(dark, DARK_SURFACE) : null

      variants.forEach((variant, index) => {
        tokens.push({
          id: `${stem}-a${variant.step}`,
          name: composeName(config, stem, `a${variant.step}`),
          kind: 'alpha',
          light: variant.color,
          dark: darkVariants?.[index]?.color ?? null,
          sourceId: swatch.id,
          comment: `${variant.step}% opacity`,
          meta: metaFor(variant.color),
        })
      })
    }
  }

  /*
   * Last word on uniqueness.
   *
   * Stems are deduplicated before expansion, but expansion invents names of
   * its own: a swatch called "Blue 500" and the 500 step of a swatch called
   * "Blue" both land on `--color-blue-500`. CSS takes the last one and drops
   * the other silently, so one colour was missing from the export and another
   * was wrong. What each token expands into depends on its own overrides, the
   * scale preset and the alpha steps, so the only place this can be settled is
   * here, once the names actually exist.
   */
  const seen = new Set<string>()
  const renames: Array<{ from: string; to: string }> = []
  for (const token of tokens) {
    if (!seen.has(token.name)) {
      seen.add(token.name)
      continue
    }
    const from = token.name
    let attempt = 2
    // The suffix has to be re-checked: `-2` may itself be a real scale step.
    let next = composeName(config, token.id, String(attempt))
    while (seen.has(next)) next = composeName(config, token.id, String(++attempt))
    seen.add(next)
    token.name = next
    token.id = `${token.id}-${attempt}`
    renames.push({ from, to: next })
  }

  return { tokens, hasDark, config, title, renames }
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
