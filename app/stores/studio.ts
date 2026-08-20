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
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export const useStudioStore = defineStore('studio', () => {
  const saved = load()

  const format = ref<ColorFormat>(saved.format)
  const activePanel = ref<PanelId>(saved.activePanel)
  const leftPanelOpen = ref(saved.leftPanelOpen)
  const rightPanelOpen = ref(saved.rightPanelOpen)
  const metric = ref<ContrastMetric>(saved.metric)
  const previewTemplate = ref(saved.previewTemplate)
  const previewScheme = ref<PreviewScheme>(saved.previewScheme)
  const previewDensity = ref<'single' | 'grid'>(saved.previewDensity)
  const showContrastBadges = ref(saved.showContrastBadges)

  /** Which colour-vision deficiency the whole studio is being viewed through. */
  const cvd = ref<CvdType>('none')

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
    shortcutsOpen,
    commandOpen,
    openPanel,
  }
})
