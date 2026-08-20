/**
 * Color space definitions.
 *
 * These drive the range sliders, the numeric inputs and the tooltips, so the
 * generator UI is entirely data-driven: adding a space here adds it everywhere.
 */

import type { ChannelDef, SpaceDef, SpaceId } from './types'

const hue = (hint: string): ChannelDef => ({
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
  hint,
})

export const SPACES: Record<SpaceId, SpaceDef> = {
  oklch: {
    id: 'oklch',
    label: 'OKLCH',
    description:
      'Perceptually uniform polar space. Equal steps in lightness look equal to the eye, so it is the best space for generating scales, dark variants and accessible pairs. Not every L/C/H combination exists in sRGB — the generator gamut-maps what falls outside.',
    perceptual: true,
    wideGamut: true,
    channels: [
      {
        key: 'l',
        label: 'L',
        name: 'Lightness',
        min: 0,
        max: 1,
        step: 0.001,
        cyclic: false,
        displayScale: 100,
        unit: '%',
        precision: 1,
        hint: 'Perceived lightness, 0% = black, 100% = white. Unlike HSL lightness this matches what you actually see: OKLCH yellow and OKLCH blue at 70% read as equally light.',
      },
      {
        key: 'c',
        label: 'C',
        name: 'Chroma',
        min: 0,
        max: 0.4,
        step: 0.001,
        cyclic: false,
        displayScale: 100,
        unit: '',
        precision: 1,
        hint: 'Colorfulness, unbounded in theory. 0 is grey; sRGB tops out near 0.37 and only for a few hues. Pushing chroma past what the gamut allows is what makes naive palettes look muddy.',
      },
      hue('Angle on the perceptual color wheel. 30° ≈ orange, 145° ≈ green, 260° ≈ blue. Hue steps here stay visually even, which HSL hue steps do not.'),
    ],
  },
  oklab: {
    id: 'oklab',
    label: 'OKLab',
    description:
      'The cartesian form of OKLCH. Useful when you want to randomise along the green–red and blue–yellow opponent axes directly rather than by hue angle.',
    perceptual: true,
    wideGamut: true,
    channels: [
      { key: 'l', label: 'L', name: 'Lightness', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 1, hint: 'Perceived lightness, identical to OKLCH lightness.' },
      { key: 'a', label: 'a', name: 'Green–Red', min: -0.4, max: 0.4, step: 0.001, cyclic: false, displayScale: 100, unit: '', precision: 1, hint: 'Opponent axis: negative is green, positive is red.' },
      { key: 'b', label: 'b', name: 'Blue–Yellow', min: -0.4, max: 0.4, step: 0.001, cyclic: false, displayScale: 100, unit: '', precision: 1, hint: 'Opponent axis: negative is blue, positive is yellow.' },
    ],
  },
  okhsl: {
    id: 'okhsl',
    label: 'OkHSL',
    description:
      'Björn Ottosson’s HSL rebuilt on OKLab. Every value in the cube is inside sRGB, so nothing ever needs gamut mapping, while lightness stays perceptual. The safest space for "random but always usable" colors.',
    perceptual: true,
    wideGamut: false,
    channels: [
      hue('Perceptual hue angle, same wheel as OKLCH.'),
      { key: 's', label: 'S', name: 'Saturation', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Chroma expressed as a fraction of the maximum chroma available at this lightness and hue. 100% is always the most colorful sRGB can go.' },
      { key: 'l', label: 'L', name: 'Lightness', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Perceived lightness, 0% black to 100% white.' },
    ],
  },
  okhsv: {
    id: 'okhsv',
    label: 'OkHSV',
    description:
      'HSV rebuilt on OKLab. Like OkHSL but with a value axis, which suits "pick a vivid hue then darken it" workflows.',
    perceptual: true,
    wideGamut: false,
    channels: [
      hue('Perceptual hue angle, same wheel as OKLCH.'),
      { key: 's', label: 'S', name: 'Saturation', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'How far from grey, as a fraction of the maximum at this value and hue.' },
      { key: 'v', label: 'V', name: 'Value', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Brightness of the most colorful version of this hue.' },
    ],
  },
  lch: {
    id: 'lch',
    label: 'LCH',
    description:
      'CIELAB in polar form. The pre-OKLCH standard: still perceptual, but with a well-known hue non-uniformity in the blue region where changing lightness visibly shifts hue.',
    perceptual: true,
    wideGamut: true,
    channels: [
      { key: 'l', label: 'L', name: 'Lightness', min: 0, max: 100, step: 0.1, cyclic: false, displayScale: 1, unit: '', precision: 1, hint: 'CIE lightness, 0 to 100.' },
      { key: 'c', label: 'C', name: 'Chroma', min: 0, max: 150, step: 0.1, cyclic: false, displayScale: 1, unit: '', precision: 1, hint: 'CIE chroma. sRGB reaches about 132 at its most saturated.' },
      hue('CIELAB hue angle. Beware: blues around 280° drift in hue as lightness changes.'),
    ],
  },
  lab: {
    id: 'lab',
    label: 'Lab',
    description: 'CIELAB cartesian form, the classic opponent-axis space used across print and imaging.',
    perceptual: true,
    wideGamut: true,
    channels: [
      { key: 'l', label: 'L', name: 'Lightness', min: 0, max: 100, step: 0.1, cyclic: false, displayScale: 1, unit: '', precision: 1, hint: 'CIE lightness, 0 to 100.' },
      { key: 'a', label: 'a', name: 'Green–Red', min: -128, max: 128, step: 0.1, cyclic: false, displayScale: 1, unit: '', precision: 1, hint: 'Negative green, positive red.' },
      { key: 'b', label: 'b', name: 'Blue–Yellow', min: -128, max: 128, step: 0.1, cyclic: false, displayScale: 1, unit: '', precision: 1, hint: 'Negative blue, positive yellow.' },
    ],
  },
  hsl: {
    id: 'hsl',
    label: 'HSL',
    description:
      'The familiar CSS space. Intuitive and universally understood, but not perceptual: hsl(60 100% 50%) (yellow) is far brighter than hsl(240 100% 50%) (blue) despite the identical lightness value. Fine for quick constraints, poor for scales.',
    perceptual: false,
    wideGamut: false,
    channels: [
      hue('Position on the RGB color wheel. 0° red, 120° green, 240° blue — mathematically even, perceptually not.'),
      { key: 's', label: 'S', name: 'Saturation', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Distance from grey. 0% grey, 100% fully saturated.' },
      { key: 'l', label: 'L', name: 'Lightness', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Geometric lightness, not perceived lightness. 50% is the most saturated point for any hue.' },
    ],
  },
  hsv: {
    id: 'hsv',
    label: 'HSV',
    description: 'The color-picker classic. Value is the brightness of the brightest channel, which is why 100% value still reads dark for blue.',
    perceptual: false,
    wideGamut: false,
    channels: [
      hue('Position on the RGB color wheel.'),
      { key: 's', label: 'S', name: 'Saturation', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Distance from white along the hue.' },
      { key: 'v', label: 'V', name: 'Value', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'Largest RGB channel. 0% is black.' },
    ],
  },
  hwb: {
    id: 'hwb',
    label: 'HWB',
    description: 'Hue plus explicit whiteness and blackness. Maps neatly onto the painter’s idea of tints and shades.',
    perceptual: false,
    wideGamut: false,
    channels: [
      hue('Position on the RGB color wheel.'),
      { key: 'w', label: 'W', name: 'Whiteness', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'How much white is mixed in — makes tints.' },
      { key: 'b', label: 'B', name: 'Blackness', min: 0, max: 1, step: 0.01, cyclic: false, displayScale: 100, unit: '%', precision: 0, hint: 'How much black is mixed in — makes shades.' },
    ],
  },
  rgb: {
    id: 'rgb',
    label: 'sRGB',
    description: 'Raw device channels. Rarely what you want for generation — random RGB is famously ugly — but occasionally useful for constraining to a technical range.',
    perceptual: false,
    wideGamut: false,
    channels: [
      { key: 'r', label: 'R', name: 'Red', min: 0, max: 1, step: 1 / 255, cyclic: false, displayScale: 255, unit: '', precision: 0, hint: 'Red channel, 0–255.' },
      { key: 'g', label: 'G', name: 'Green', min: 0, max: 1, step: 1 / 255, cyclic: false, displayScale: 255, unit: '', precision: 0, hint: 'Green channel, 0–255.' },
      { key: 'b', label: 'B', name: 'Blue', min: 0, max: 1, step: 1 / 255, cyclic: false, displayScale: 255, unit: '', precision: 0, hint: 'Blue channel, 0–255.' },
    ],
  },
  p3: {
    id: 'p3',
    label: 'Display P3',
    description:
      'The wider gamut modern displays ship with — roughly 25% more colors than sRGB, mostly in reds and greens. Colors defined here fall back to their sRGB approximation on older screens.',
    perceptual: false,
    wideGamut: true,
    channels: [
      { key: 'r', label: 'R', name: 'Red', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 1, hint: 'P3 red primary component.' },
      { key: 'g', label: 'G', name: 'Green', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 1, hint: 'P3 green primary component.' },
      { key: 'b', label: 'B', name: 'Blue', min: 0, max: 1, step: 0.001, cyclic: false, displayScale: 100, unit: '%', precision: 1, hint: 'P3 blue primary component.' },
    ],
  },
}

export const SPACE_IDS = Object.keys(SPACES) as SpaceId[]

export function getSpace(id: SpaceId): SpaceDef {
  return SPACES[id] ?? SPACES.oklch
}

export function getChannel(space: SpaceId, key: string): ChannelDef | undefined {
  return getSpace(space).channels.find((c) => c.key === key)
}
