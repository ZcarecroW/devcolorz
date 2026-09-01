import { describe, expect, it } from 'vitest'
import { deriveShadows } from '@/lib/theme/tokens'

describe('deriveShadows', () => {
  it('falls back to the documented defaults for a cleared field', () => {
    const cleared = deriveShadows({ 'shadow-opacity': '', 'shadow-blur': '' })
    const absent = deriveShadows({})
    expect(cleared).toEqual(absent)
    expect(absent.sm).toContain('10.0%')
  })

  it('falls back to the default colour when the colour is cleared', () => {
    expect(deriveShadows({ 'shadow-color': '' }).sm).toContain('oklch(0 0 0)')
  })
})
