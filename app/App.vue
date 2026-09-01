<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { blockedForAnonymous } from '@/router'
import { Toaster } from '@/components/ui/sonner'
import AppHeader from '@/components/shell/AppHeader.vue'
import CvdFilters from '@/components/a11y/CvdFilters.vue'
import { useSessionStore } from '@/stores/session'
import { useStudioStore } from '@/stores/studio'
import { useThemeStore } from '@/stores/theme'
import type { ColorFormat } from '@/lib/color/types'
import type { ContrastMetric } from '@/lib/color/contrast'

const router = useRouter()
const theme = useThemeStore()
const studio = useStudioStore()
const session = useSessionStore()

/**
 * Seed a first-time visitor from the instance's own defaults.
 *
 * The administrator can set a default appearance, notation and contrast metric.
 * Nothing read them, so those five controls in the Settings tab saved happily
 * and changed nothing at all. They apply only to a browser with no stored
 * preference: a default is where someone starts, not something that reasserts
 * itself over a choice they have already made.
 */
function applyInstanceDefaults() {
  const defaults = session.meta?.defaults
  if (!defaults) return

  if (theme.appearanceIsDefault && defaults.appearance) {
    theme.setAppearance(defaults.appearance)
  }
  if (studio.usingDefaults) {
    if (defaults.format) studio.format = defaults.format as ColorFormat
    if (defaults.contrastMetric) studio.metric = defaults.contrastMetric as ContrastMetric
  }
}

let unbindSystem: (() => void) | null = null

const main = useTemplateRef<HTMLElement>('main')

/**
 * Move focus to the new page after a navigation.
 *
 * Clicking a header link replaces everything under the header and leaves
 * focus where it was — on a control that may no longer exist — so a keyboard
 * user's next Tab started again from the top, and a screen reader said
 * nothing about the page having changed. Focusing `main` restarts the tab
 * order at the new content. The studio's own address-bar rewrites are left
 * alone: they rename the route from `studio` to `shared` while a palette is
 * being edited, and taking focus off a slider mid-drag would be worse than
 * the silence.
 */
const SAME_PAGE = new Set(['studio', 'shared'])
const unhookFocus = router.afterEach((to, from) => {
  if (!from.name || to.name === from.name) return
  if (SAME_PAGE.has(String(to.name)) && SAME_PAGE.has(String(from.name))) return
  void nextTick(() => main.value?.focus({ preventScroll: true }))
})

onMounted(async () => {
  unbindSystem = theme.bindSystemPreference()
  theme.apply()
  await session.bootstrap()
  applyInstanceDefaults()

  // The guard lets the first navigation through without waiting for `/meta`,
  // so the wall — if this instance has one — is applied here, once the answer
  // has actually arrived.
  if (blockedForAnonymous(session, router.currentRoute.value.name)) {
    void router.replace({
      name: 'login',
      query: { redirect: router.currentRoute.value.fullPath },
    })
  }
})

onBeforeUnmount(() => {
  unbindSystem?.()
  unhookFocus()
})
</script>

<template>
  <!--
    The shell is exactly one viewport tall and never scrolls itself. The studio
    is a three-column layout whose side panels scroll independently, and a
    scrolling page underneath that would push the swatch strip's hex labels off
    the bottom of the screen — which is precisely what happened before this.
    Pages that genuinely need to scroll scroll `main`.
  -->
  <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
    <AppHeader />
    <!--
      `relative` is load-bearing, not decoration. An absolutely positioned
      descendant whose nearest positioned ancestor is the document — a bare
      `.sr-only` label, for instance — is laid out against the initial
      containing block, so `overflow` here does not clip it and its static
      position two thousand pixels down the panel becomes two thousand pixels
      of empty document to scroll through. Positioning every scroll container
      keeps that overflow where it belongs.
    -->
    <!--
      Focusable, so a navigation can land focus on the new content, and with
      no outline: it is a programmatic target, never something a person tabs
      to, and a ring around the whole page would only read as a glitch.
    -->
    <main
      ref="main"
      tabindex="-1"
      class="scroll-slim relative flex min-h-0 flex-1 flex-col overflow-y-auto outline-none"
    >
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <!--
      The toaster follows the app's own light/dark mode: vue-sonner keys its
      rich-colour palettes off `data-theme`, and a light error toast on a dark
      page was the unreadable result of leaving it at the default.
    -->
    <Toaster :theme="theme.mode" position="bottom-right" rich-colors close-button />
    <!--
      The colour-blindness simulation filters live once, at the document root,
      so any preview can reference them by id without each instance minting its
      own SVG.
    -->
    <CvdFilters />
  </div>
</template>
