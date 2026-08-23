/**
 * Studio UI state.
 *
 * Deliberately separate from the palette store: undo must rewind colours, not
 * which panel happens to be open. Keeping the two apart is what stops Ctrl+Z
 * from closing a sidebar.
 */

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ColorFormat } from '@/lib/color/types'
import type { CvdType } from '@/lib/color/cvd'
import type { ContrastMetric } from '@/lib/color/contrast'
import type { PaletteView } from '@/lib/palette/layout'

export type PanelId = 'generate' | 'harmony' | 'scales' | 'image' | 'a11y' | 'export'

/**
 * How a preview decides between a light and a dark scheme.
 *
 * `auto` follows the app's own appearance — which is what a monitor icon
 * beside Light and Dark means to everyone who has ever used one. `palette` is
 * the other useful question: which scheme is this palette actually built for?
 * They were the same option once, and the mismatch showed: with the system in
 * dark mode, "auto" cheerfully rendered a light preview.
 */
export type PreviewScheme = 'auto' | 'light' | 'dark' | 'palette'

const KEY = 'devcolorz:studio'

interface Persisted {
  format: ColorFormat
  activePanel: PanelId
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  metric: ContrastMetric
  previewTemplate: string
  previewScheme: PreviewScheme
  previewDensity: 'single' | 'grid'
  showContrastBadges: boolean
  cvd: CvdType
  paletteView: PaletteView
}

const DEFAULTS: Persisted = {
  format: 'hex',
  activePanel: 'generate',
  leftPanelOpen: true,
  rightPanelOpen: true,
  metric: 'apca',
  previewTemplate: 'landing-hero',
  previewScheme: 'auto',
  previewDensity: 'single',
  showContrastBadges: false,
  cvd: 'none',
  paletteView: 'columns',
}

function load(): { values: Persisted; restored: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { values: DEFAULTS, restored: false }
    return { values: { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) }, restored: true }
  } catch {
    return { values: DEFAULTS, restored: false }
  }
}

export const useStudioStore = defineStore('studio', () => {
  const { values: saved, restored } = load()
  /**
   * False on a browser that has never used this instance.
   *
   * The administrator's engine defaults are applied only then: once a visitor
   * has picked a notation or a contrast metric, a server-side default has no
   * business overwriting it on the next reload.
   */
  const usingDefaults = ref(!restored)

  const format = ref<ColorFormat>(saved.format)
  const activePanel = ref<PanelId>(saved.activePanel)
  const leftPanelOpen = ref(saved.leftPanelOpen)
  const rightPanelOpen = ref(saved.rightPanelOpen)
  const metric = ref<ContrastMetric>(saved.metric)
  const previewTemplate = ref(saved.previewTemplate)
  const previewScheme = ref<PreviewScheme>(saved.previewScheme)
  const previewDensity = ref<'single' | 'grid'>(saved.previewDensity)
  const showContrastBadges = ref(saved.showContrastBadges)

  /**
   * Which colour-vision deficiency the palette is being viewed through.
   *
   * Persisted: an accessibility review is not a single glance, and having the
   * simulation silently reset on every reload made it look like the control
   * had done nothing at all.
   */
  const cvd = ref<CvdType>(saved.cvd)

  /** How the palette itself is laid out. See @/lib/palette/layout. */
  const paletteView = ref<PaletteView>(saved.paletteView)

  /** The keyboard-shortcut cheat sheet. */
  const shortcutsOpen = ref(false)
  /** The ⌘K command palette. */
  const commandOpen = ref(false)

  watch(
    [
      format,
      activePanel,
      leftPanelOpen,
      rightPanelOpen,
      metric,
      previewTemplate,
      previewScheme,
      previewDensity,
      showContrastBadges,
      cvd,
      paletteView,
    ],
    () => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            format: format.value,
            activePanel: activePanel.value,
            leftPanelOpen: leftPanelOpen.value,
            rightPanelOpen: rightPanelOpen.value,
            metric: metric.value,
            previewTemplate: previewTemplate.value,
            previewScheme: previewScheme.value,
            previewDensity: previewDensity.value,
            showContrastBadges: showContrastBadges.value,
            cvd: cvd.value,
            paletteView: paletteView.value,
          } satisfies Persisted),
        )
      } catch {
        // Storage being unavailable is not a reason to break the studio.
      }
    },
  )

  function openPanel(id: PanelId) {
    activePanel.value = id
    leftPanelOpen.value = true
  }

  return {
    format,
    activePanel,
    leftPanelOpen,
    rightPanelOpen,
    metric,
    previewTemplate,
    previewScheme,
    previewDensity,
    showContrastBadges,
    cvd,
    paletteView,
    shortcutsOpen,
    commandOpen,
    usingDefaults,
    openPanel,
  }
})
