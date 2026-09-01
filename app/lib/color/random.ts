/**
 * Range-constrained random color generation.
 *
 * This is the heart of DevColorz. Instead of "press space for a random
 * palette", you describe the region of a color space you want colors drawn
 * from — per channel, with a distribution — and every roll lands inside it.
 * Modelled on the range-based randomisation in Astute Graphics' Randomino,
 * generalised across eleven color spaces.
 */

import type { Oklch } from 'culori'
import { fromChannelValues, toSpace } from './convert'
import { deltaEOK, mapToGamut } from './gamut'
import { getSpace } from './spaces'
import type {
  ChannelConstraint,
  Distribution,
  GeneratorConstraints,
  Range,
  SpaceId,
  ColorInput,
} from './types'

/* ------------------------------------------------------------------ *
 * Seeded RNG
 * ------------------------------------------------------------------ */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** The seed this generator was created from. */
  readonly seed: number
}

/**
 * mulberry32 — 32-bit, fast, and statistically good enough for palettes.
 * Deterministic: the same seed always yields the same palette, which is what
 * makes shareable "seed" URLs and reproducible previews possible.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    seed,
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export function randomSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 0xffffffff)
}

/* ------------------------------------------------------------------ *
 * Distributions
 * ------------------------------------------------------------------ */

const GOLDEN = 0.618033988749895

/** Box–Muller, returning a standard normal clipped to ±3σ. */
function gaussian(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng.next()
  while (v === 0) v = rng.next()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-3, Math.min(3, z))
}

/**
 * Draw a value in [0, 1] shaped by the chosen distribution.
 *
 * `index` and `count` let sequence-aware distributions (golden, stratified)
 * spread a whole batch evenly instead of clustering by chance. `salt` tells
 * two channels of the same colour apart: the golden sequence is a pure
 * function of the seed and the index, so without it two channels both set to
 * it moved in lockstep and the palette ran along one diagonal of the space.
 */
export function sample(
  rng: Rng,
  distribution: Distribution,
  spread: number,
  index: number,
  count: number,
  salt = 0,
): number {
  switch (distribution) {
    case 'gaussian': {
      // spread 1 => 1σ covers half the range, so ~68% land in the middle half.
      const sigma = 0.25 / Math.max(0.05, spread)
      return Math.min(1, Math.max(0, 0.5 + gaussian(rng) * sigma))
    }
    case 'edges': {
      // Bathtub: pushes values toward both ends of the range. The exponent is
      // kept at or above 1, since below it the curve leaves [0, 1] altogether.
      const t = rng.next()
      const exponent = 1 + 2 * Math.max(0, spread)
      const bent = t < 0.5 ? 0.5 * Math.pow(2 * t, exponent) : 1 - 0.5 * Math.pow(2 - 2 * t, exponent)
      return Math.min(1, Math.max(0, bent))
    }
    case 'golden': {
      // Golden-ratio additive recurrence: maximally spread, no clumping.
      const offset = rng.seed / 4294967296
      return (offset + salt * 0.381966011 + index * GOLDEN) % 1
    }
    case 'stratified': {
      // Split the range into `count` equal bins, jitter within each.
      const n = Math.max(1, count)
      return (index % n) / n + rng.next() / n
    }
    case 'blue-noise': {
      // Best-candidate: draw a few, keep the one furthest from the last pick.
      const tries = 6
      let best = rng.next()
      let bestDist = -1
      const anchor = (index * GOLDEN) % 1
      for (let i = 0; i < tries; i++) {
        const candidate = rng.next()
        const d = Math.abs(candidate - anchor)
        const wrapped = Math.min(d, 1 - d)
        if (wrapped > bestDist) {
          bestDist = wrapped
          best = candidate
        }
      }
      return best
    }
    case 'uniform':
    default:
      return rng.next()
  }
}

/* ------------------------------------------------------------------ *
 * Ranges
 * ------------------------------------------------------------------ */

/**
 * Map a unit value onto a range. For cyclic channels a range whose `min`
 * exceeds its `max` wraps through the origin — so 340→20 means "the reds",
 * not "everything except the reds".
 */
export function mapToRange(t: number, range: Range, cyclic: boolean, wrapAt: number): number {
  const { min, max } = range
  if (!cyclic || min <= max) {
    return min + t * (max - min)
  }
  const span = wrapAt - min + max
  const value = min + t * span
  return value % wrapAt
}

/** Width of a range, honouring wrap-around for cyclic channels. */
export function rangeSpan(range: Range, cyclic: boolean, wrapAt: number): number {
  if (!cyclic || range.min <= range.max) return range.max - range.min
  return wrapAt - range.min + range.max
}

/** Does a value fall inside a possibly-wrapping range? */
export function inRange(value: number, range: Range, cyclic: boolean, wrapAt: number): boolean {
  if (!cyclic || range.min <= range.max) return value >= range.min && value <= range.max
  const v = ((value % wrapAt) + wrapAt) % wrapAt
  return v >= range.min || v <= range.max
}

/* ------------------------------------------------------------------ *
 * Constraint construction
 * ------------------------------------------------------------------ */

/** A full-width, uniform constraint set for a space — the neutral starting point. */
export function defaultConstraints(space: SpaceId = 'oklch'): GeneratorConstraints {
  const def = getSpace(space)
  const channels: Record<string, ChannelConstraint> = {}
  for (const ch of def.channels) {
    channels[ch.key] = {
      range: { min: ch.min, max: ch.max },
      locked: false,
      value: (ch.min + ch.max) / 2,
      distribution: 'uniform',
      spread: 1,
    }
  }
  // Full-width OKLCH is mostly unusable colors (near-black, near-white,
  // impossible chroma), so the shipped default is a sensible design window.
  if (space === 'oklch') {
    channels.l.range = { min: 0.35, max: 0.85 }
    channels.c.range = { min: 0.06, max: 0.22 }
  }
  if (space === 'hsl') {
    channels.s.range = { min: 0.4, max: 0.9 }
    channels.l.range = { min: 0.35, max: 0.7 }
  }
  if (space === 'okhsl') {
    channels.s.range = { min: 0.4, max: 1 }
    channels.l.range = { min: 0.35, max: 0.8 }
  }
  return {
    space,
    channels,
    minDistance: 8,
    gamut: 'css4',
    seed: null,
  }
}

/**
 * Re-express constraints in a different space, keeping the user's intent as
 * far as the geometry allows. Channels that exist in both spaces keep their
 * relative position; the rest reset to full width.
 */
export function retargetConstraints(
  constraints: GeneratorConstraints,
  space: SpaceId,
): GeneratorConstraints {
  const next = defaultConstraints(space)
  const from = getSpace(constraints.space)
  const to = getSpace(space)
  for (const ch of to.channels) {
    const source = from.channels.find((c) => c.key === ch.key && c.cyclic === ch.cyclic)
    const prev = source ? constraints.channels[source.key] : undefined
    if (!source || !prev) continue
    const scale = (v: number) => {
      const t = (v - source.min) / (source.max - source.min || 1)
      return ch.min + t * (ch.max - ch.min)
    }
    next.channels[ch.key] = {
      ...prev,
      range: { min: scale(prev.range.min), max: scale(prev.range.max) },
      value: scale(prev.value),
    }
  }
  next.minDistance = constraints.minDistance
  next.gamut = constraints.gamut
  next.seed = constraints.seed
  return next
}

/* ------------------------------------------------------------------ *
 * Generation
 * ------------------------------------------------------------------ */

export interface GenerateOptions {
  count: number
  constraints: GeneratorConstraints
  /** Colors already in the palette that new colors must stay distinct from. */
  avoid?: ColorInput[]
  /** Overrides `constraints.seed`. */
  seed?: number
}

/** Draw a single color from the constrained region. */
export function randomColor(
  rng: Rng,
  constraints: GeneratorConstraints,
  index = 0,
  count = 1,
): Oklch {
  const def = getSpace(constraints.space)
  const values: Record<string, number> = {}
  def.channels.forEach((ch, ordinal) => {
    const constraint = constraints.channels[ch.key]
    if (!constraint) {
      values[ch.key] = (ch.min + ch.max) / 2
      return
    }
    if (constraint.locked) {
      values[ch.key] = constraint.value
      return
    }
    const t = sample(rng, constraint.distribution, constraint.spread, index, count, ordinal)
    values[ch.key] = mapToRange(t, constraint.range, ch.cyclic, ch.max)
  })
  const raw = fromChannelValues(constraints.space, values)
  return mapToGamut(raw, constraints.gamut)
}

/**
 * Generate `count` colors that satisfy the constraints and stay at least
 * `minDistance` apart perceptually.
 *
 * Rejection sampling with a decaying threshold: if a tight range simply cannot
 * hold `count` distinct colors, the requirement relaxes rather than hanging.
 */
export function generatePalette(options: GenerateOptions): Oklch[] {
  const { count, constraints } = options
  const seed = options.seed ?? constraints.seed ?? randomSeed()
  const rng = createRng(seed)
  const avoid = (options.avoid ?? []).slice()
  const out: Oklch[] = []
  const target = constraints.minDistance / 100

  for (let i = 0; i < count; i++) {
    let best: Oklch | null = null
    let bestDistance = -1
    const maxAttempts = target > 0 ? 40 : 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Each retry moves a whole batch further along the sequence. The golden
      // distribution never draws from the generator, so retrying it at the
      // same index produced the same value forty times over and the distance
      // requirement could not be met on that channel at all. A later point in
      // the sequence is just as evenly spread, and the stratified bins repeat
      // every `count`, so they are unaffected.
      const candidate = randomColor(rng, constraints, i + attempt * count, count)
      if (target <= 0) {
        best = candidate
        break
      }
      let nearest = Infinity
      for (const other of [...avoid, ...out]) {
        const d = deltaEOK(candidate, other)
        if (d < nearest) nearest = d
      }
      if (nearest === Infinity) {
        best = candidate
        break
      }
      if (nearest > bestDistance) {
        bestDistance = nearest
        best = candidate
      }
      // Relax the requirement as attempts pile up so tight ranges still finish.
      const relaxed = target * (1 - attempt / maxAttempts)
      if (nearest >= relaxed) break
    }
    out.push(best ?? randomColor(rng, constraints, i, count))
  }
  return out
}

/**
 * Preview swatches for the constraint panel: a deterministic grid that shows
 * the shape of the current region at a glance and re-rolls as sliders move.
 * Uses a fixed seed so dragging a slider produces a smooth, comparable change
 * rather than a completely different grid on every frame.
 */
export function previewSwatches(
  constraints: GeneratorConstraints,
  count = 48,
  seed = 0x5eed,
): Oklch[] {
  const rng = createRng(constraints.seed ?? seed)
  const out: Oklch[] = []
  for (let i = 0; i < count; i++) out.push(randomColor(rng, constraints, i, count))
  return out
}

/**
 * Derive constraints from an existing set of colors — "lock the vibe of this
 * palette, then generate more like it". Ranges are the observed min/max padded
 * by `padding` (as a fraction of the channel width).
 */
export function constraintsFromColors(
  colors: ColorInput[],
  space: SpaceId = 'oklch',
  padding = 0.05,
): GeneratorConstraints {
  const base = defaultConstraints(space)
  if (!colors.length) return base
  const def = getSpace(space)
  const converted = colors.map((c) => toSpace(c, space) as unknown as Record<string, number>)

  for (const ch of def.channels) {
    const values = converted.map((c) => (Number.isFinite(c[ch.key]) ? c[ch.key] : 0))
    const pad = (ch.max - ch.min) * padding
    if (ch.cyclic) {
      // Find the tightest arc containing every hue, so reds spanning 350→10
      // produce {min: 350, max: 10} rather than the useless {min: 10, max: 350}.
      const sorted = [...values].map((v) => ((v % ch.max) + ch.max) % ch.max).sort((a, b) => a - b)
      let gapStart = 0
      let gap = 0
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]
        const b = sorted[(i + 1) % sorted.length]
        const d = i === sorted.length - 1 ? ch.max - a + b : b - a
        if (d > gap) {
          gap = d
          gapStart = i
        }
      }
      const min = sorted[(gapStart + 1) % sorted.length]
      const max = sorted[gapStart]
      base.channels[ch.key].range = {
        min: (((min - pad) % ch.max) + ch.max) % ch.max,
        max: (((max + pad) % ch.max) + ch.max) % ch.max,
      }
    } else {
      base.channels[ch.key].range = {
        min: Math.max(ch.min, Math.min(...values) - pad),
        max: Math.min(ch.max, Math.max(...values) + pad),
      }
    }
  }
  return base
}

export const DISTRIBUTION_LABELS: Record<Distribution, string> = {
  uniform: 'Uniform',
  gaussian: 'Gaussian',
  edges: 'Edges',
  golden: 'Golden ratio',
  stratified: 'Stratified',
  'blue-noise': 'Blue noise',
}

export const DISTRIBUTION_HINTS: Record<Distribution, string> = {
  uniform: 'Every value in the range is equally likely. Honest randomness — which also means occasional clumps.',
  gaussian: 'Values cluster around the middle of the range and thin out toward the edges. Use it when you want a dominant tone with occasional outliers. The spread control widens or tightens the bell.',
  edges: 'The inverse of gaussian: values are pushed toward both ends of the range. Good for high-contrast pairs where you want darks and lights but nothing in between.',
  golden: 'Steps around the range by the golden ratio. Consecutive colors are maximally far apart with no clumping at all — the classic trick for generating distinct hues.',
  stratified: 'Splits the range into one bin per color and jitters within each bin. Guarantees the whole range is covered evenly, with a bit of randomness left in.',
  'blue-noise': 'Draws several candidates and keeps whichever is furthest from the others. Evenly spaced like golden ratio, but non-repeating.',
}
