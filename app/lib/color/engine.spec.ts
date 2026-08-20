import { describe, expect, it } from 'vitest'
import { formatColor, parseColor } from './convert'
import { apca, makeReadable, wcag, wcagLevel } from './contrast'
import { cssGamutMap, deltaEOK, isInGamut, maxChroma } from './gamut'
import { harmony, fromRybHue, rotateHue, toRybHue } from './harmony'
import { toDark } from './invert'
import { solveAlpha, composite } from './alpha'
import { generateScale } from './scale'
import {
  constraintsFromColors,
  createRng,
  defaultConstraints,
  generatePalette,
  inRange,
  mapToRange,
} from './random'
import { assignRoles, auditRoles } from './roles'
import { cvdSafetyScore, simulate } from './cvd'
import { describeColor, slugify, uniqueSlugs } from './name'

describe('parsing and formatting', () => {
  it('accepts every notation we advertise', () => {
    for (const input of [
      '#f0a',
      'ff00aa',
      'rgb(255 0 170)',
      'rgba(255, 0, 170, 0.5)',
      'hsl(320 100% 50%)',
      'oklch(70% 0.2 350)',
      'oklab(0.7 0.1 -0.05)',
      'lab(50% 40 -20)',
      'color(display-p3 1 0 0.6)',
      'rebeccapurple',
    ]) {
      expect(parseColor(input), input).not.toBeNull()
    }
  })

  it('rejects nonsense', () => {
    expect(parseColor('not a color')).toBeNull()
    expect(parseColor('')).toBeNull()
  })

  it('round-trips hex without drift', () => {
    const color = parseColor('#3b82f6')!
    expect(formatColor(color, 'hex')).toBe('#3b82f6')
  })

  it('emits modern and legacy syntaxes correctly', () => {
    const color = parseColor('rgba(255, 0, 170, 0.5)')!
    expect(formatColor(color, 'rgb')).toBe('rgb(255 0 170 / 0.5)')
    expect(formatColor(color, 'rgb-legacy')).toBe('rgba(255, 0, 170, 0.5)')
    expect(formatColor(parseColor('#fff')!, 'rgb')).toBe('rgb(255 255 255)')
  })

  it('never emits negative zero', () => {
    const grey = parseColor('#808080')!
    expect(formatColor(grey, 'oklch')).not.toContain('-0')
  })
})

describe('WCAG contrast', () => {
  it('matches the canonical extremes', () => {
    expect(wcag('#000', '#fff')).toBeCloseTo(21, 5)
    expect(wcag('#fff', '#fff')).toBeCloseTo(1, 5)
  })

  it('grades levels the way the spec does', () => {
    expect(wcagLevel(21)).toBe('AAA')
    expect(wcagLevel(4.5)).toBe('AA')
    expect(wcagLevel(3)).toBe('AA Large')
    expect(wcagLevel(2.9)).toBe('Fail')
    expect(wcagLevel(3, true)).toBe('AA')
  })
})

describe('APCA', () => {
  // Values cross-checked by hand against the APCA-W3 0.1.9 formula:
  // linearise at gamma 2.4, soft-clamp black below Y 0.022, then
  // (Ybg^0.56 - Ytxt^0.57) * 1.14 - 0.027 for dark-on-light.
  it('matches the reference vectors', () => {
    expect(apca('#000', '#fff')).toBeCloseTo(106.04, 1)
    expect(apca('#fff', '#000')).toBeCloseTo(-107.88, 1)
    expect(apca('#888', '#fff')).toBeCloseTo(63.06, 1)
    expect(apca('#fff', '#888')).toBeCloseTo(-68.54, 1)
    expect(apca('#123', '#def')).toBeCloseTo(91.67, 1)
  })

  it('is directional, unlike WCAG', () => {
    const a = apca('#333', '#eee')
    const b = apca('#eee', '#333')
    expect(Math.sign(a)).not.toBe(Math.sign(b))
    expect(Math.abs(a)).not.toBeCloseTo(Math.abs(b), 1)
  })

  it('returns zero for identical colors', () => {
    expect(apca('#777', '#777')).toBe(0)
  })
})

describe('gamut mapping', () => {
  it('leaves in-gamut colors untouched', () => {
    const color = parseColor('#3b82f6')!
    const mapped = cssGamutMap(color)
    expect(deltaEOK(color, mapped)).toBeLessThan(1e-6)
  })

  it('brings impossible colors into sRGB', () => {
    const impossible = { mode: 'oklch' as const, l: 0.75, c: 0.37, h: 150 }
    expect(isInGamut(impossible)).toBe(false)
    const mapped = cssGamutMap(impossible)
    expect(isInGamut(mapped)).toBe(true)
  })

  it('preserves hue far better than clipping does', () => {
    const impossible = { mode: 'oklch' as const, l: 0.6, c: 0.35, h: 250 }
    const mapped = cssGamutMap(impossible)
    const hueDrift = Math.abs((mapped.h ?? 0) - 250)
    expect(hueDrift).toBeLessThan(6)
  })

  it('reports a plausible chroma ceiling', () => {
    // sRGB can hold a lot of chroma at mid lightness and almost none near white.
    expect(maxChroma(0.6, 25)).toBeGreaterThan(0.15)
    expect(maxChroma(0.99, 250)).toBeLessThan(0.03)
  })
})

describe('the RYB wheel', () => {
  it('round-trips', () => {
    for (let h = 0; h < 360; h += 17) {
      expect(fromRybHue(toRybHue(h))).toBeCloseTo(h, 0)
    }
  })

  it('puts orange opposite blue, which is the whole point', () => {
    const blue = 264 // OKLCH blue
    const complement = rotateHue(blue, 180, 'ryb')
    // Orange lives around 40-70 degrees in OKLCH.
    expect(complement).toBeGreaterThan(30)
    expect(complement).toBeLessThan(90)
  })

  it('puts yellow opposite blue on the perceptual wheel instead', () => {
    const complement = rotateHue(264, 180, 'oklch')
    expect(complement).toBeCloseTo(84, 0)
  })
})

describe('harmony', () => {
  it('returns exactly the requested number of colors', () => {
    for (const id of ['complementary', 'triadic', 'analogous', 'monochromatic', 'shades'] as const) {
      for (const count of [1, 3, 5, 12]) {
        expect(harmony('#3b82f6', id, { count }).length, `${id}@${count}`).toBe(count)
      }
    }
  })

  it('keeps a monochromatic set on one hue', () => {
    const colors = harmony('#3b82f6', 'monochromatic', { count: 7 })
    const hues = colors.map((c) => c.h ?? 0)
    const spread = Math.max(...hues) - Math.min(...hues)
    expect(spread).toBeLessThan(12)
  })

  it('produces monotonically darkening shades', () => {
    const colors = harmony('#3b82f6', 'shades', { count: 6 })
    for (let i = 1; i < colors.length; i++) {
      expect(colors[i].l ?? 0).toBeLessThan(colors[i - 1].l ?? 0)
    }
  })

  it('always returns displayable colors', () => {
    for (const id of ['complementary', 'triadic', 'tints', 'tones'] as const) {
      for (const color of harmony('#ff0080', id, { count: 8 })) {
        expect(isInGamut(color), `${id} ${JSON.stringify(color)}`).toBe(true)
      }
    }
  })
})

describe('range-based generation', () => {
  it('is deterministic for a given seed', () => {
    const constraints = defaultConstraints('oklch')
    const a = generatePalette({ count: 6, constraints, seed: 1234 })
    const b = generatePalette({ count: 6, constraints, seed: 1234 })
    expect(a.map((c) => c.l)).toEqual(b.map((c) => c.l))
  })

  it('differs across seeds', () => {
    const constraints = defaultConstraints('oklch')
    const a = generatePalette({ count: 6, constraints, seed: 1 })
    const b = generatePalette({ count: 6, constraints, seed: 2 })
    expect(a.map((c) => c.l)).not.toEqual(b.map((c) => c.l))
  })

  it('respects channel ranges', () => {
    const constraints = defaultConstraints('oklch')
    constraints.channels.l.range = { min: 0.4, max: 0.5 }
    constraints.channels.c.range = { min: 0.05, max: 0.08 }
    constraints.gamut = 'keep'
    for (const color of generatePalette({ count: 24, constraints, seed: 7 })) {
      expect(color.l).toBeGreaterThanOrEqual(0.4 - 1e-6)
      expect(color.l).toBeLessThanOrEqual(0.5 + 1e-6)
    }
  })

  it('honours locked channels exactly', () => {
    const constraints = defaultConstraints('oklch')
    constraints.channels.h.locked = true
    constraints.channels.h.value = 200
    constraints.gamut = 'keep'
    for (const color of generatePalette({ count: 12, constraints, seed: 3 })) {
      expect(color.h).toBeCloseTo(200, 4)
    }
  })

  it('wraps hue ranges through zero', () => {
    const wrapped = { min: 340, max: 20 }
    expect(inRange(350, wrapped, true, 360)).toBe(true)
    expect(inRange(10, wrapped, true, 360)).toBe(true)
    expect(inRange(180, wrapped, true, 360)).toBe(false)
    expect(mapToRange(0, wrapped, true, 360)).toBeCloseTo(340)
    expect(mapToRange(1, wrapped, true, 360)).toBeCloseTo(20, 5)
    // Half-way through a 340->20 arc is exactly 0 degrees.
    expect(mapToRange(0.5, wrapped, true, 360)).toBeCloseTo(0, 5)
  })

  it('keeps generated colors apart when asked', () => {
    const constraints = defaultConstraints('oklch')
    constraints.minDistance = 12
    const colors = generatePalette({ count: 5, constraints, seed: 42 })
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        expect(deltaEOK(colors[i], colors[j]) * 100).toBeGreaterThan(4)
      }
    }
  })

  it('derives a wrapping hue range from wrapping colors', () => {
    const constraints = constraintsFromColors(['#ff0000', '#ff3355', '#ff8800'], 'oklch')
    const range = constraints.channels.h.range
    // Reds straddle 0 degrees, so the derived range must wrap rather than
    // spanning the entire wheel the long way round.
    expect(range.min > range.max || range.max - range.min < 120).toBe(true)
  })

  it('produces a stable stream from the RNG', () => {
    const rng = createRng(99)
    const values = Array.from({ length: 5 }, () => rng.next())
    const again = createRng(99)
    expect(Array.from({ length: 5 }, () => again.next())).toEqual(values)
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('dark-mode derivation', () => {
  it('darkens light colors and lightens dark ones', () => {
    const light = parseColor('#f8fafc')!
    const dark = toDark(light)
    expect(dark.l ?? 0).toBeLessThan(0.3)

    const deep = parseColor('#0f172a')!
    expect(toDark(deep).l ?? 0).toBeGreaterThan(0.7)
  })

  it('keeps the hue', () => {
    const source = parseColor('#3b82f6')!
    const dark = toDark(source)
    expect(Math.abs((dark.h ?? 0) - (source.h ?? 0))).toBeLessThan(2)
  })

  it('respects the dark floor so backgrounds never hit pure black', () => {
    const dark = toDark('#ffffff', { darkFloor: 0.16 })
    expect(dark.l ?? 0).toBeGreaterThanOrEqual(0.15)
  })

  it('preserves contrast when asked to', () => {
    const source = parseColor('#2563eb')!
    const dark = toDark(source, {
      strategy: 'contrast-preserve',
      lightBackground: parseColor('#ffffff')!,
      darkBackground: parseColor('#0b0b0f')!,
      metric: 'wcag',
    })
    const lightRatio = wcag(source, '#ffffff')
    const darkRatio = wcag(dark, '#0b0b0f')
    expect(Math.abs(lightRatio - darkRatio)).toBeLessThan(0.6)
  })

  it('always returns displayable colors', () => {
    for (const strategy of ['oklch-curve', 'radix', 'material', 'oklch-flip', 'hsl-flip'] as const) {
      for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000']) {
        expect(isInGamut(toDark(hex, { strategy })), `${strategy} ${hex}`).toBe(true)
      }
    }
  })
})

describe('alpha solving', () => {
  it('reproduces the target when composited back', () => {
    const target = parseColor('#e6f0ff')!
    const background = parseColor('#ffffff')!
    const solved = solveAlpha(target, background)
    expect(solved.exact).toBe(true)
    expect(deltaEOK(composite(solved.color, background), target) * 100).toBeLessThan(1)
  })

  it('finds the minimum workable alpha', () => {
    const solved = solveAlpha('#f2f2f2', '#ffffff')
    // A barely-tinted target over white needs very little opacity.
    expect(solved.alpha).toBeLessThan(0.2)
  })

  it('works over dark backgrounds too', () => {
    const solved = solveAlpha('#2a2a35', '#18181b')
    expect(deltaEOK(composite(solved.color, '#18181b'), parseColor('#2a2a35')!) * 100).toBeLessThan(1.5)
  })
})

describe('tonal scales', () => {
  it('produces the Tailwind key set', () => {
    const scale = generateScale('#3b82f6', { preset: 'tailwind' })
    expect(scale.map((s) => s.key)).toEqual([
      '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
    ])
  })

  it('darkens monotonically', () => {
    const scale = generateScale('#3b82f6', { preset: 'tailwind', pinSeed: false })
    for (let i = 1; i < scale.length; i++) {
      expect(scale[i].color.l ?? 0).toBeLessThan(scale[i - 1].color.l ?? 0)
    }
  })

  it('hits its contrast targets in contrast mode', () => {
    const scale = generateScale('#3b82f6', {
      preset: 'tailwind',
      mode: 'contrast',
      metric: 'wcag',
      pinSeed: false,
    })
    // The 700 step is the one people reach for when they need AA text on white.
    const step700 = scale.find((s) => s.key === '700')!
    expect(wcag(step700.color, '#ffffff')).toBeGreaterThan(4.4)
  })

  it('gives every Radix step a documented purpose', () => {
    const scale = generateScale('#3b82f6', { preset: 'radix' })
    expect(scale).toHaveLength(12)
    for (const step of scale) expect(step.purpose.length).toBeGreaterThan(0)
  })
})

describe('role assignment', () => {
  const palettes: Record<string, string[]> = {
    two: ['#0f172a', '#f8fafc'],
    three: ['#264653', '#2a9d8f', '#e9c46a'],
    coolors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
    monochrome: ['#111111', '#333333', '#555555', '#777777', '#999999'],
    neon: ['#ff00ff', '#00ffff', '#ffff00'],
    allDark: ['#101010', '#181818', '#202020'],
    allLight: ['#f0f0f0', '#f5f5f5', '#fafafa'],
    single: ['#3b82f6'],
    twenty: Array.from({ length: 20 }, (_, i) => `hsl(${i * 18} 65% ${30 + (i % 5) * 12}%)`),
  }

  it('always produces readable body text', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const roles = assignRoles(palette)
      const lc = Math.abs(apca(roles.text.color, roles.background.color))
      expect(lc, `${name}: Lc ${lc.toFixed(1)}`).toBeGreaterThan(70)
    }
  })

  it('always produces a readable label on the primary color', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      const roles = assignRoles(palette)
      const lc = Math.abs(apca(roles.textOnPrimary.color, roles.primary.color))
      expect(lc, `${name}: Lc ${lc.toFixed(1)}`).toBeGreaterThan(55)
    }
  })

  it('fills the requested number of chart series whatever the palette size', () => {
    for (const palette of Object.values(palettes)) {
      expect(assignRoles(palette, { chartCount: 8 }).chart).toHaveLength(8)
    }
  })

  it('detects the scheme from the palette', () => {
    expect(assignRoles(palettes.allLight).scheme).toBe('light')
    expect(assignRoles(palettes.allDark).scheme).toBe('dark')
  })

  it('honours a forced scheme', () => {
    const roles = assignRoles(palettes.allLight, { scheme: 'dark' })
    expect(roles.scheme).toBe('dark')
    expect(roles.background.color.l ?? 1).toBeLessThan(0.35)
  })

  it('keeps primary and accent distinguishable', () => {
    for (const [name, palette] of Object.entries(palettes)) {
      if (palette.length < 3) continue
      const roles = assignRoles(palette)
      expect(deltaEOK(roles.primary.color, roles.accent.color) * 100, name).toBeGreaterThan(3)
    }
  })

  it('audits cleanly for well-formed palettes', () => {
    const roles = assignRoles(palettes.coolors)
    expect(auditRoles(roles).filter((a) => a.severity === 'error')).toHaveLength(0)
  })

  it('survives an empty palette', () => {
    const roles = assignRoles([])
    expect(roles.background).toBeTruthy()
    expect(Math.abs(apca(roles.text.color, roles.background.color))).toBeGreaterThan(60)
  })
})

describe('color vision deficiency', () => {
  it('collapses red and green under deuteranopia', () => {
    const red = simulate('#ff0000', 'deuteranopia')
    const green = simulate('#00ff00', 'deuteranopia')
    expect(deltaEOK(red, green) * 100).toBeLessThan(
      deltaEOK('#ff0000', '#00ff00') * 100,
    )
  })

  it('leaves colors alone for normal vision', () => {
    expect(deltaEOK(simulate('#3b82f6', 'none'), '#3b82f6')).toBeLessThan(1e-6)
  })

  it('scores a red/green pair worse than a light/dark pair', () => {
    const redGreen = cvdSafetyScore(['#e63946', '#2a9d8f'])
    const lightDark = cvdSafetyScore(['#0b1021', '#f1faee'])
    expect(lightDark).toBeGreaterThanOrEqual(redGreen)
  })

  it('returns 100 for a palette with nothing to confuse', () => {
    expect(cvdSafetyScore(['#000000'])).toBe(100)
  })
})

describe('naming', () => {
  it('describes colors structurally', () => {
    expect(describeColor('#000000')).toBe('Black')
    expect(describeColor('#ffffff')).toBe('White')
    expect(describeColor('#808080')).toContain('grey')
    expect(describeColor('#ff0000').toLowerCase()).toContain('red')
    expect(describeColor('#0000ff').toLowerCase()).toMatch(/blue|indigo|violet/)
  })

  it('slugifies safely', () => {
    expect(slugify('Brand Primary')).toBe('brand-primary')
    expect(slugify('  Grün / Blau  ')).toBe('grun-blau')
    expect(slugify('!!!')).toBe('color')
    expect(slugify('')).toBe('color')
  })

  it('de-duplicates slugs so exports never collide', () => {
    expect(uniqueSlugs(['Blue', 'Blue', 'blue'])).toEqual(['blue', 'blue-2', 'blue-3'])
  })
})

describe('makeReadable', () => {
  it('lifts an unreadable color until it passes', () => {
    const fixed = makeReadable('#cccccc', '#ffffff', { metric: 'wcag', target: 4.5 })
    expect(fixed).not.toBeNull()
    expect(wcag(fixed!, '#ffffff')).toBeGreaterThanOrEqual(4.4)
  })

  it('leaves already-readable colors alone', () => {
    const source = parseColor('#111111')!
    const fixed = makeReadable(source, '#ffffff', { metric: 'wcag', target: 4.5 })
    expect(deltaEOK(fixed!, source)).toBeLessThan(1e-6)
  })

  it('keeps the hue while fixing', () => {
    const fixed = makeReadable('#8ecae6', '#ffffff', { metric: 'wcag', target: 4.5 })!
    expect(Math.abs((fixed.h ?? 0) - (parseColor('#8ecae6')!.h ?? 0))).toBeLessThan(3)
  })
})
