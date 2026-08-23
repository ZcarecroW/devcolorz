/**
 * Role assignment — the algorithm that makes previews work.
 *
 * A preview template needs a background, a surface, text, a border, a primary
 * and some accents. A user's palette is an arbitrary list of between one and
 * fifty colors with no semantics at all. Naively mapping index 0 to background
 * and index 1 to text produces unreadable garbage roughly half the time, which
 * is exactly what every other palette tool does.
 *
 * Instead we *solve* for the assignment: pick the palette colors that best fit
 * each role, then derive the rest from the palette's own hues so that even a
 * two-color palette yields a complete, legible, on-brand interface.
 *
 * Every derived value is flagged, so the UI can honestly show which colors
 * came from the palette and which we invented.
 */

import type { Oklch } from 'culori'
import type { ColorInput } from './types'
import { toOklch } from './convert'
import { apca, bestBlackOrWhite, makeReadable, score, type ContrastMetric } from './contrast'
import { deltaEOK, mapToGamut, maxChroma } from './gamut'

export type RoleKey =
  | 'background'
  | 'surface'
  | 'surfaceAlt'
  | 'overlay'
  | 'text'
  | 'textMuted'
  | 'textOnPrimary'
  | 'textOnAccent'
  | 'border'
  | 'borderStrong'
  | 'primary'
  | 'primaryHover'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export interface RoleValue {
  color: Oklch
  /** Index into the source palette, or -1 when the color was derived. */
  source: number
  derived: boolean
}

export interface RoleMap extends Record<RoleKey, RoleValue> {
  /** Ordered, maximally distinct series for charts and categorical data. */
  chart: RoleValue[]
  /** Every palette color, ordered light → dark, for templates that want them all. */
  ramp: RoleValue[]
  /** Whether the resulting scheme is light or dark. */
  scheme: 'light' | 'dark'
}

export interface RoleOptions {
  /** Force a scheme, or let the palette decide. */
  scheme: 'light' | 'dark' | 'auto'
  metric: ContrastMetric
  /** Minimum contrast body text must reach. APCA Lc or WCAG ratio. */
  textTarget: number
  /** Minimum contrast UI elements must reach. */
  uiTarget: number
  /**
   * How willing we are to invent colors. At 0 only palette colors are used,
   * even when the result is ugly; at 1 anything missing is derived.
   */
  derive: number
  /** How many chart series to produce. */
  chartCount: number
}

export const DEFAULT_ROLE_OPTIONS: RoleOptions = {
  scheme: 'auto',
  metric: 'apca',
  textTarget: 75,
  uiTarget: 45,
  derive: 1,
  chartCount: 6,
}

const lightnessOf = (c: ColorInput) => toOklch(c).l ?? 0
const chromaOf = (c: ColorInput) => toOklch(c).c ?? 0
const hueOf = (c: ColorInput) => toOklch(c).h ?? 0

/** Smallest angle between two hues, 0–180. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}

/** Nudge a color's lightness by `delta`, keeping hue and re-fitting chroma. */
function shiftLightness(color: ColorInput, delta: number): Oklch {
  const base = toOklch(color) as Oklch
  const l = Math.min(1, Math.max(0, (base.l ?? 0.5) + delta))
  const hue = base.h ?? 0
  return mapToGamut({ mode: 'oklch', l, c: Math.min(base.c ?? 0, maxChroma(l, hue)), h: hue }, 'css4')
}

/** Mix two colors in OKLab by `amount` (0 = a, 1 = b). */
export function mix(a: ColorInput, b: ColorInput, amount: number): Oklch {
  const x = toOklch(a) as Oklch
  const y = toOklch(b) as Oklch
  const hx = x.h ?? 0
  const hy = y.h ?? 0
  // Shortest arc, so mixing red and magenta does not travel through green.
  let dh = hy - hx
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  const l = (x.l ?? 0) + ((y.l ?? 0) - (x.l ?? 0)) * amount
  const h = hx + dh * amount
  const c = (x.c ?? 0) + ((y.c ?? 0) - (x.c ?? 0)) * amount
  return mapToGamut({ mode: 'oklch', l, c: Math.min(c, maxChroma(l, h)), h }, 'css4')
}

const value = (color: Oklch, source: number): RoleValue => ({ color, source, derived: source < 0 })
const derivedValue = (color: Oklch): RoleValue => ({ color, source: -1, derived: true })

/**
 * Assign every role from an arbitrary palette.
 *
 * The order matters: background is decided first because every other decision
 * is a contrast decision, and contrast is meaningless without a background.
 */
export function assignRoles(palette: ColorInput[], options: Partial<RoleOptions> = {}): RoleMap {
  const opts = { ...DEFAULT_ROLE_OPTIONS, ...options }
  const colors = (palette.length ? palette : ['#111111', '#f5f5f5']).map((c) => toOklch(c) as Oklch)
  const indexed = colors.map((color, index) => ({ color, index }))
  const byLightness = [...indexed].sort((a, b) => lightnessOf(b.color) - lightnessOf(a.color))
  const byChroma = [...indexed].sort((a, b) => chromaOf(b.color) - chromaOf(a.color))

  const meanLightness = colors.reduce((sum, c) => sum + (c.l ?? 0), 0) / colors.length
  const scheme: 'light' | 'dark' =
    opts.scheme === 'auto' ? (meanLightness >= 0.55 ? 'light' : 'dark') : opts.scheme

  /* ---------------- background ---------------- */

  // Prefer an extreme-lightness, low-chroma palette color; a saturated
  // background is a deliberate choice, not a default.
  const backgroundCandidates = scheme === 'light' ? byLightness.slice(0, 3) : byLightness.slice(-3)
  const backgroundPick = backgroundCandidates
    .slice()
    .sort((a, b) => chromaOf(a.color) - chromaOf(b.color))[0]

  const wantedBgL = scheme === 'light' ? 0.985 : 0.16
  const bgFits =
    scheme === 'light' ? lightnessOf(backgroundPick.color) > 0.9 : lightnessOf(backgroundPick.color) < 0.28

  const background: RoleValue =
    bgFits || opts.derive === 0
      ? value(backgroundPick.color, backgroundPick.index)
      : // Derive a tinted neutral from the palette's dominant hue: a pure grey
        // next to a saturated palette always looks like an accident.
        derivedValue(
          mapToGamut(
            {
              mode: 'oklch',
              l: wantedBgL,
              c: Math.min(scheme === 'light' ? 0.008 : 0.014, maxChroma(wantedBgL, hueOf(byChroma[0].color))),
              h: hueOf(byChroma[0].color),
            },
            'css4',
          ),
        )

  const bg = background.color
  const towardText = scheme === 'light' ? -1 : 1

  /* ---------------- surfaces ---------------- */

  const surface = derivedValue(shiftLightness(bg, towardText * (scheme === 'light' ? -0.028 : 0.035)))
  const surfaceAlt = derivedValue(shiftLightness(bg, towardText * (scheme === 'light' ? -0.06 : 0.07)))
  const overlay = derivedValue({
    ...toOklch(scheme === 'light' ? '#000000' : '#000000'),
    alpha: scheme === 'light' ? 0.45 : 0.65,
  } as Oklch)

  /* ---------------- text ---------------- */

  let textPick: RoleValue | null = null
  let bestTextScore = -Infinity
  for (const entry of indexed) {
    const s = score(entry.color, bg, opts.metric)
    if (s > bestTextScore) {
      bestTextScore = s
      textPick = value(entry.color, entry.index)
    }
  }
  const text: RoleValue =
    textPick && bestTextScore >= opts.textTarget
      ? textPick
      : opts.derive === 0 && textPick
        ? textPick
        : derivedValue(
            // Keep the palette's hue in the text — a warm palette deserves a
            // warm near-black, not #000.
            makeReadable(
              {
                mode: 'oklch',
                l: scheme === 'light' ? 0.2 : 0.96,
                c: Math.min(0.02, maxChroma(scheme === 'light' ? 0.2 : 0.96, hueOf(byChroma[0].color))),
                h: hueOf(byChroma[0].color),
              } as Oklch,
              bg,
              { metric: opts.metric, target: opts.textTarget },
            ) ?? bestBlackOrWhite(bg, opts.metric),
          )

  const textMuted = derivedValue(mix(text.color, bg, scheme === 'light' ? 0.42 : 0.38))

  /* ---------------- primary / accents ---------------- */

  /** Score a candidate for "looks like a brand color against this background". */
  const brandScore = (color: Oklch) => {
    const contrast = score(color, bg, opts.metric)
    if (contrast < opts.uiTarget) return -1
    const chroma = chromaOf(color)
    const l = lightnessOf(color)
    // Reward chroma, penalise being too close to the background's lightness.
    const separation = Math.min(1, Math.abs(l - lightnessOf(bg)) * 2.2)
    return chroma * 3 + separation * 0.6
  }

  const brandRanked = [...indexed]
    .map((entry) => ({ ...entry, score: brandScore(entry.color) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  let primary: RoleValue = brandRanked.length
    ? value(brandRanked[0].color, brandRanked[0].index)
    : derivedValue(
        makeReadable(byChroma[0].color, bg, { metric: opts.metric, target: opts.uiTarget }) ??
          byChroma[0].color,
      )

  // A primary you cannot put a legible label on is not a usable primary. When
  // we invented the color ourselves we are free to keep moving it until a
  // button built from it actually works; a color the user chose we leave alone
  // and report through auditRoles instead.
  if (primary.derived) {
    let candidate = primary.color
    const step = scheme === 'light' ? -0.02 : 0.02
    for (let i = 0; i < 40; i++) {
      const label = bestBlackOrWhite(candidate, opts.metric)
      if (Math.abs(apca(label, candidate)) >= 62) break
      const next = shiftLightness(candidate, step)
      if (Math.abs((next.l ?? 0) - (candidate.l ?? 0)) < 1e-6) break
      candidate = next
    }
    primary = derivedValue(candidate)
  }

  /**
   * Pick the next brand candidate that is furthest in hue from everything
   * chosen so far, skipping anything perceptually identical to a pick.
   */
  const pickDistinct = (taken: Oklch[]): { color: Oklch; index: number } | null => {
    let best: { color: Oklch; index: number } | null = null
    let bestGap = -1
    for (const entry of brandRanked) {
      if (taken.some((t) => deltaEOK(t, entry.color) < 0.04)) continue
      const gap = Math.min(...taken.map((t) => hueDistance(hueOf(t), hueOf(entry.color))))
      if (gap > bestGap) {
        bestGap = gap
        best = entry
      }
    }
    return best
  }

  /**
   * Invent a companion color for `taken`.
   *
   * Rotating the hue is the obvious move, and it is wrong for a greyscale
   * palette: rotating the hue of a grey produces the same grey, which is how
   * tools end up shipping a "primary" and an "accent" that are byte-identical.
   * With no chroma to rotate, the honest companion is a different step of the
   * palette's own ramp.
   */
  const inventCompanion = (taken: Oklch[], rotation: number): Oklch => {
    const anchor = taken[0]
    if (chromaOf(anchor) >= 0.04) {
      const l = lightnessOf(anchor)
      const h = (hueOf(anchor) + rotation) % 360
      return mapToGamut({ mode: 'oklch', l, c: Math.min(chromaOf(anchor), maxChroma(l, h)), h }, 'css4')
    }
    let best: Oklch | null = null
    let bestDistance = -1
    for (const entry of indexed) {
      if (score(entry.color, bg, opts.metric) < opts.uiTarget * 0.6) continue
      const nearest = Math.min(...taken.map((t) => deltaEOK(t, entry.color)))
      if (nearest > bestDistance) {
        bestDistance = nearest
        best = entry.color
      }
    }
    if (best && bestDistance > 0.05) return best
    return shiftLightness(anchor, scheme === 'light' ? 0.24 : -0.24)
  }

  const accentPick = pickDistinct([primary.color])
  const accent: RoleValue = accentPick
    ? value(accentPick.color, accentPick.index)
    : derivedValue(inventCompanion([primary.color], 150))

  const secondaryPick = pickDistinct([primary.color, accent.color])
  const secondary: RoleValue = secondaryPick
    ? value(secondaryPick.color, secondaryPick.index)
    : derivedValue(inventCompanion([primary.color, accent.color], 210))

  const primaryHover = derivedValue(
    shiftLightness(primary.color, scheme === 'light' ? -0.06 : 0.06),
  )
  const textOnPrimary = derivedValue(bestBlackOrWhite(primary.color, opts.metric))
  const textOnAccent = derivedValue(bestBlackOrWhite(accent.color, opts.metric))

  /* ---------------- borders ---------------- */

  const border = derivedValue(mix(bg, text.color, scheme === 'light' ? 0.14 : 0.18))
  const borderStrong = derivedValue(mix(bg, text.color, scheme === 'light' ? 0.28 : 0.34))

  /* ---------------- status colors ---------------- */

  /**
   * Status colors have to *mean* something, so we look for a palette color in
   * the right hue neighbourhood and only invent one if the palette has nothing
   * close. A palette with no red does not get a green "danger" button.
   */
  const statusFrom = (targetHue: number, tolerance: number, fallbackChroma: number): RoleValue => {
    let best: { color: Oklch; index: number } | null = null
    let bestGap = Infinity
    for (const entry of indexed) {
      if (chromaOf(entry.color) < 0.04) continue
      if (score(entry.color, bg, opts.metric) < opts.uiTarget) continue
      const gap = hueDistance(hueOf(entry.color), targetHue)
      if (gap < bestGap) {
        bestGap = gap
        best = entry
      }
    }
    if (best && bestGap <= tolerance) return value(best.color, best.index)
    const l = scheme === 'light' ? 0.58 : 0.7
    return derivedValue(
      mapToGamut({ mode: 'oklch', l, c: Math.min(fallbackChroma, maxChroma(l, targetHue)), h: targetHue }, 'css4'),
    )
  }

  const success = statusFrom(148, 32, 0.16)
  const warning = statusFrom(75, 26, 0.17)
  const danger = statusFrom(27, 26, 0.19)
  const info = statusFrom(245, 32, 0.15)

  /* ---------------- chart series ---------------- */

  /**
   * Farthest-point ordering: start from the most colorful usable swatch, then
   * repeatedly take whichever remaining color is furthest from everything
   * already picked. Adjacent series in a chart end up maximally distinct,
   * which matters far more than preserving the palette's order.
   */
  const chartPool = indexed.filter(
    (entry) => score(entry.color, bg, opts.metric) >= opts.uiTarget * 0.6,
  )
  const pool = (chartPool.length >= 2 ? chartPool : indexed).slice()
  const chart: RoleValue[] = []
  if (pool.length) {
    let current = pool.reduce((a, b) => (chromaOf(a.color) >= chromaOf(b.color) ? a : b))
    chart.push(value(current.color, current.index))
    const remaining = pool.filter((entry) => entry !== current)
    while (chart.length < Math.min(opts.chartCount, pool.length) && remaining.length) {
      let bestIndex = 0
      let bestDistance = -1
      remaining.forEach((entry, i) => {
        const nearest = Math.min(...chart.map((c) => deltaEOK(c.color, entry.color)))
        if (nearest > bestDistance) {
          bestDistance = nearest
          bestIndex = i
        }
      })
      current = remaining.splice(bestIndex, 1)[0]
      chart.push(value(current.color, current.index))
    }
  }
  /*
   * Extend the series when the palette cannot fill it.
   *
   * Two things were wrong here. `chart.length % chart.length` is always 0, so
   * every invented series was seeded from the same colour; and rotating the
   * hue of a colour with no chroma returns that colour unchanged, so a
   * greyscale palette produced up to five byte-identical "distinct" chart
   * colours — two lines on a chart that are provably the same grey.
   *
   * Chromatic seeds still rotate hue. Achromatic ones walk lightness instead,
   * which is the only axis a grey has, and each candidate is checked against
   * everything already in the series so a step that lands on an existing one
   * is pushed further rather than emitted.
   */
  const chartOriginals = chart.length
  let rotation = 1
  while (chart.length < opts.chartCount) {
    const seed = chart[(chart.length - 1) % Math.max(1, chartOriginals)] ?? primary
    const seedChroma = chromaOf(seed.color)
    let candidate: Oklch

    if (seedChroma >= 0.04) {
      const l = lightnessOf(seed.color)
      const h = (hueOf(seed.color) + rotation * 47) % 360
      candidate = mapToGamut(
        { mode: 'oklch', l, c: Math.min(seedChroma, maxChroma(l, h)), h },
        'css4',
      )
    } else {
      // Alternate above and below the seed, widening each time, and stop at
      // the first step that is far enough from every colour already chosen.
      const base = lightnessOf(seed.color)
      const h = hueOf(seed.color)
      candidate = { mode: 'oklch', l: base, c: 0, h }
      for (let step = 1; step <= 8; step++) {
        const delta = (step % 2 === 0 ? -1 : 1) * Math.ceil(step / 2) * 0.11
        const l = Math.min(0.94, Math.max(0.16, base + delta))
        const attempt: Oklch = { mode: 'oklch', l, c: 0, h }
        if (chart.every((existing) => Math.abs(lightnessOf(existing.color) - l) > 0.07)) {
          candidate = attempt
          break
        }
        candidate = attempt
      }
    }

    chart.push(derivedValue(candidate))
    rotation++
  }

  const ramp = byLightness.map((entry) => value(entry.color, entry.index))

  return {
    scheme,
    background,
    surface,
    surfaceAlt,
    overlay,
    text,
    textMuted,
    textOnPrimary,
    textOnAccent,
    border,
    borderStrong,
    primary,
    primaryHover,
    secondary,
    accent,
    success,
    warning,
    danger,
    info,
    chart,
    ramp,
  }
}

/** Turn a role map into the CSS custom properties a preview component consumes. */
export function rolesToCssVars(roles: RoleMap, format: (c: ColorInput) => string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, entry] of Object.entries(roles)) {
    if (key === 'chart' || key === 'ramp' || key === 'scheme') continue
    const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    vars[`--p-${kebab}`] = format((entry as RoleValue).color)
  }
  roles.chart.forEach((entry, i) => {
    vars[`--p-chart-${i + 1}`] = format(entry.color)
  })
  roles.ramp.forEach((entry, i) => {
    vars[`--p-ramp-${i + 1}`] = format(entry.color)
  })
  vars['--p-ramp-count'] = String(roles.ramp.length)
  return vars
}

/** A quick health check on an assignment, surfaced as warnings in the UI. */
export interface RoleAudit {
  key: string
  message: string
  severity: 'error' | 'warning'
}

export function auditRoles(roles: RoleMap): RoleAudit[] {
  const out: RoleAudit[] = []
  const bodyLc = Math.abs(apca(roles.text.color, roles.background.color))
  if (bodyLc < 75) {
    out.push({
      key: 'text',
      severity: bodyLc < 60 ? 'error' : 'warning',
      message: `Body text reaches only Lc ${bodyLc.toFixed(0)} against the background. Lc 75 is the practical minimum for reading at 16px.`,
    })
  }
  const primaryLc = Math.abs(apca(roles.textOnPrimary.color, roles.primary.color))
  if (primaryLc < 60) {
    out.push({
      key: 'primary',
      severity: 'warning',
      message: `Label text on the primary color reaches Lc ${primaryLc.toFixed(0)}. Buttons need Lc 60 or better.`,
    })
  }
  const borderLc = Math.abs(apca(roles.border.color, roles.background.color))
  if (borderLc < 12) {
    out.push({
      key: 'border',
      severity: 'warning',
      message: 'Borders are nearly invisible against the background.',
    })
  }
  if (deltaEOK(roles.primary.color, roles.accent.color) < 0.06) {
    out.push({
      key: 'accent',
      severity: 'warning',
      message: 'The primary and accent colors are too similar to read as different roles.',
    })
  }
  return out
}
