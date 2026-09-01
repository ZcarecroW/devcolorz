import { describe, expect, it } from 'vitest'
import { parseColor } from '@/lib/color/convert'
import { DEFAULT_EXPORT_CONFIG, type ExportConfig } from '@/lib/export/config'
import { EMITTERS_BY_ID, emittedFiles } from '@/lib/export/emitters'
import { buildGraph } from '@/lib/export/graph'
import { makeSwatch } from '@/stores/palette'

const swatches = () => ['#264653', '#2a9d8f', '#e9c46a'].map((hex) => makeSwatch(parseColor(hex)!))

function graphWith(config: Partial<ExportConfig>, list = swatches()) {
  return buildGraph(list, { ...DEFAULT_EXPORT_CONFIG, ...config }, 'Test')
}

describe('output that has to be valid for its target', () => {
  it('names the configured dark class in the Tailwind v4 variant', () => {
    const out = EMITTERS_BY_ID.tailwind4.emit(graphWith({ emitDark: true, darkClass: '.night' }))
    expect(out).toContain('@custom-variant dark (&:where(.night, .night *))')
    expect(out).not.toContain('.dark')
  })

  it('emits a well-formed SVG when every colour is excluded', () => {
    const list = swatches()
    const overrides = Object.fromEntries(list.map((s) => [s.id, { exclude: true }]))
    const out = EMITTERS_BY_ID.svg.emit(graphWith({ overrides }, list))
    expect(out).not.toContain('NaN')
    expect(out).toMatch(/width="\d+" height="\d+"/)
  })

  it('splits Android output into one document per mode', () => {
    const files = emittedFiles(EMITTERS_BY_ID.android, graphWith({ emitDark: true }), 'palette')
    expect(files.map((f) => f.path)).toEqual(['values/colors.xml', 'values-night/colors.xml'])
    for (const file of files) {
      expect(file.content.match(/<resources>/g)).toHaveLength(1)
      expect(file.content.startsWith('<?xml')).toBe(true)
    }
  })

  it('downloads a single-file format under the emitter extension', () => {
    const files = emittedFiles(EMITTERS_BY_ID.css, graphWith({}), 'palette')
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('palette.css')
  })

  it('outranks a high-specificity base selector with the dark override', () => {
    const out = EMITTERS_BY_ID.css.emit(
      graphWith({ emitDark: true, darkDelivery: 'class', selector: '#app' }),
    )
    expect(out).toContain('.dark#app, .dark #app {')
  })

  it('leaves the default root selector with a plain class override', () => {
    const out = EMITTERS_BY_ID.css.emit(graphWith({ emitDark: true, darkDelivery: 'class' }))
    expect(out).toContain('\n.dark {')
  })
})
