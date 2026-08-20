/**
 * Color vision deficiency simulation.
 *
 * Uses the Machado, Oliveira & Fernandes (2009) model, which handles partial
 * deficiency properly rather than only the dichromatic extremes — about 6% of
 * men have anomalous trichromacy, not full dichromacy, so severity matters.
 */

import {
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  filterGrayscale,
  type Color,
} from 'culori'
import { toOklch } from './convert'
import { deltaEOK } from './gamut'
import type { Oklch } from './types'

export type CvdType =
  | 'none'
  | 'protanopia'
  | 'protanomaly'
  | 'deuteranopia'
  | 'deuteranomaly'
  | 'tritanopia'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly'

interface CvdDef {
  id: CvdType
  label: string
  /** Share of the population affected, as shown in the UI. */
  prevalence: string
  hint: string
  apply: (color: Color) => Color
}

const identity = (color: Color) => color

export const CVD_TYPES: Record<CvdType, CvdDef> = {
  none: {
    id: 'none',
    label: 'Normal vision',
    prevalence: '~92% of people',
    hint: 'Full trichromatic vision — the palette as authored.',
    apply: identity,
  },
  protanopia: {
    id: 'protanopia',
    label: 'Protanopia',
    prevalence: '~1% of men',
    hint: 'No working long-wavelength (red) cones. Reds darken dramatically and collapse toward the greens — a red error state can become indistinguishable from a green success state, and dark red on black effectively disappears.',
    apply: filterDeficiencyProt(1) as never,
  },
  protanomaly: {
    id: 'protanomaly',
    label: 'Protanomaly',
    prevalence: '~1% of men',
    hint: 'Reduced red sensitivity. Reds look duller and shift toward green; the deficiency is partial, so some red–green distinction survives.',
    apply: filterDeficiencyProt(0.6) as never,
  },
  deuteranopia: {
    id: 'deuteranopia',
    label: 'Deuteranopia',
    prevalence: '~1% of men',
    hint: 'No working medium-wavelength (green) cones. The most common form of severe color blindness. Reds and greens converge on a muddy yellow-brown; unlike protanopia, overall lightness is roughly preserved.',
    apply: filterDeficiencyDeuter(1) as never,
  },
  deuteranomaly: {
    id: 'deuteranomaly',
    label: 'Deuteranomaly',
    prevalence: '~5% of men',
    hint: 'Reduced green sensitivity, and by far the most common deficiency of all. Mild enough that many people never get diagnosed — which is exactly why palettes need to survive it.',
    apply: filterDeficiencyDeuter(0.6) as never,
  },
  tritanopia: {
    id: 'tritanopia',
    label: 'Tritanopia',
    prevalence: '<0.01%, affects all genders equally',
    hint: 'No working short-wavelength (blue) cones. Blues turn green and yellows turn pink or grey. Rare and inherited independently of the red–green types.',
    apply: filterDeficiencyTrit(1) as never,
  },
  tritanomaly: {
    id: 'tritanomaly',
    label: 'Tritanomaly',
    prevalence: '<0.01%',
    hint: 'Reduced blue sensitivity. Blue–green and yellow–red distinctions become harder.',
    apply: filterDeficiencyTrit(0.6) as never,
  },
  achromatopsia: {
    id: 'achromatopsia',
    label: 'Achromatopsia',
    prevalence: '~1 in 30,000',
    hint: 'No color vision at all. This is also the best proxy for greyscale printing, low-quality projectors and e-ink — if your palette works here, lightness alone carries the meaning.',
    apply: filterGrayscale(1) as never,
  },
  achromatomaly: {
    id: 'achromatomaly',
    label: 'Achromatomaly',
    prevalence: 'very rare',
    hint: 'Severely reduced but not absent color perception.',
    apply: filterGrayscale(0.7) as never,
  },
}

export const CVD_IDS = Object.keys(CVD_TYPES) as CvdType[]

/** The set worth checking every palette against. */
export const CVD_AUDIT_SET: CvdType[] = [
  'deuteranomaly',
  'deuteranopia',
  'protanopia',
  'tritanopia',
  'achromatopsia',
]

/** Simulate how a color appears under a given deficiency. */
export function simulate(color: Color, type: CvdType): Oklch {
  const def = CVD_TYPES[type] ?? CVD_TYPES.none
  return toOklch(def.apply(color)) as Oklch
}

/** Simulate a whole palette. */
export function simulatePalette(colors: Color[], type: CvdType): Oklch[] {
  if (type === 'none') return colors.map((c) => toOklch(c) as Oklch)
  return colors.map((c) => simulate(c, type))
}

export interface CvdCollision {
  a: number
  b: number
  type: CvdType
  /** ΔEOK × 100 between the two colors under this deficiency. */
  distance: number
  /** ΔEOK × 100 between the same two colors in normal vision. */
  originalDistance: number
}

/**
 * Find pairs that become confusable under any audited deficiency.
 *
 * `threshold` is in ΔEOK×100 units; 5 is roughly "a careful eye can still
 * tell them apart", 2 is "these are the same color now".
 */
export function findCollisions(colors: Color[], threshold = 5): CvdCollision[] {
  const out: CvdCollision[] = []
  for (const type of CVD_AUDIT_SET) {
    const simulated = simulatePalette(colors, type)
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const distance = deltaEOK(simulated[i], simulated[j]) * 100
        if (distance >= threshold) continue
        const originalDistance = deltaEOK(colors[i], colors[j]) * 100
        // Colors that were already near-identical are the author's problem,
        // not the deficiency's — only report pairs that genuinely collapse.
        if (originalDistance < threshold * 1.5) continue
        out.push({ a: i, b: j, type, distance, originalDistance })
      }
    }
  }
  return out.sort((x, y) => x.distance - y.distance)
}

/**
 * A single 0–100 score for how well a palette survives color blindness:
 * the fraction of distinguishable pairs that stay distinguishable.
 */
export function cvdSafetyScore(colors: Color[], threshold = 5): number {
  if (colors.length < 2) return 100
  let pairs = 0
  let survived = 0
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      if (deltaEOK(colors[i], colors[j]) * 100 < threshold * 1.5) continue
      pairs++
      const worst = Math.min(
        ...CVD_AUDIT_SET.map((type) =>
          deltaEOK(simulate(colors[i], type), simulate(colors[j], type)) * 100,
        ),
      )
      if (worst >= threshold) survived++
    }
  }
  return pairs === 0 ? 100 : Math.round((survived / pairs) * 100)
}
