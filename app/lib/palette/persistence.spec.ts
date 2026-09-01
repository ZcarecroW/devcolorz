import { describe, expect, it } from 'vitest'
import { parseColor } from '@/lib/color/convert'
import { docFromState, stateFromPalette } from '@/lib/palette/document'
import { decodeState, encodeState } from '@/lib/palette/url'
import type { PaletteState } from '@/lib/palette/url'

function state(partial: Partial<PaletteState> = {}): PaletteState {
  const colors = partial.colors ?? [parseColor('#3b82f6')!, parseColor('#ef4444')!]
  return {
    colors,
    locks: partial.locks ?? colors.map(() => false),
    names: partial.names ?? colors.map(() => ''),
    ...(partial.seed !== undefined ? { seed: partial.seed } : {}),
  }
}

describe('alpha survives every persistence path', () => {
  const translucent = { ...parseColor('#3b82f6')!, alpha: 0.5 }

  it('round-trips through the short hex-list link', async () => {
    const encoded = await encodeState(state({ colors: [translucent] }))
    const decoded = await decodeState(encoded)
    expect(decoded?.colors[0].alpha).toBeCloseTo(0.5, 2)
  })

  it('round-trips through the compressed link, alongside names and locks', async () => {
    const encoded = await encodeState(
      state({ colors: [translucent, parseColor('#ef4444')!], locks: [true, false], names: ['Glass', ''] }),
    )
    const decoded = await decodeState(encoded)
    expect(decoded?.colors[0].alpha).toBeCloseTo(0.5, 2)
    expect(decoded?.colors[1].alpha ?? 1).toBe(1)
    expect(decoded?.names).toEqual(['Glass', ''])
    expect(decoded?.locks).toEqual([true, false])
  })

  it('round-trips through the saved document', () => {
    const doc = docFromState(state({ colors: [translucent] }))
    expect(stateFromPalette({ doc } as never)!.colors[0].alpha).toBeCloseTo(0.5, 3)
  })

  it('writes no alpha for an opaque colour, so documents do not churn', () => {
    expect(docFromState(state({ colors: [parseColor('#3b82f6')!] })).colors[0].oklch).toHaveLength(3)
  })

  it('still reads a document written before alpha was carried', () => {
    const legacy = { version: 1, colors: [{ hex: '#3b82f6', oklch: [0.62, 0.19, 259.8] }] }
    const read = stateFromPalette({ doc: legacy } as never)!
    expect(read.colors[0].alpha ?? 1).toBe(1)
    expect(read.colors).toHaveLength(1)
  })

  it('still reads a six-digit link', async () => {
    const decoded = await decodeState('3b82f6-ef4444')
    expect(decoded?.colors).toHaveLength(2)
    expect(decoded?.colors[0].alpha ?? 1).toBe(1)
  })
})

describe('links and documents that used to lose or corrupt colours', () => {
  it('carries a wide-gamut colour through the packed link', async () => {
    const p3red = { mode: 'oklch', l: 0.6486, c: 0.2995, h: 28.96 } as const
    const encoded = await encodeState(state({ colors: [p3red], names: ['Red'] }))
    const decoded = await decodeState(encoded)
    expect(decoded?.colors[0].c).toBeCloseTo(0.2995, 3)
    expect(decoded?.colors[0].l).toBeCloseTo(0.6486, 3)
    expect(decoded?.names).toEqual(['Red'])
  })

  it('treats a malformed link as no link rather than an error', async () => {
    await expect(decodeState('%')).resolves.toBeNull()
    await expect(decodeState('v1r%E0%A4%A')).resolves.toBeNull()
  })

  it('falls back to hex when a stored channel tuple is incomplete', () => {
    const doc = { version: 1, colors: [{ hex: '#3b82f6', oklch: [0.5] }] }
    const read = stateFromPalette({ doc } as never)!
    expect(read.colors).toHaveLength(1)
    expect(read.colors[0].c).toBeGreaterThan(0.1)
    expect(Number.isFinite(read.colors[0].h)).toBe(true)
  })
})
