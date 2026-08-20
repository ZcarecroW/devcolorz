<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import AppHeader from '@/components/shell/AppHeader.vue'
import CvdFilters from '@/components/a11y/CvdFilters.vue'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
const session = useSessionStore()

let unbindSystem: (() => void) | null = null

onMounted(() => {
  unbindSystem = theme.bindSystemPreference()
  theme.apply()
  void session.bootstrap()
})

onBeforeUnmount(() => {
  unbindSystem?.()
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
    <main class="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <Toaster position="bottom-right" rich-colors close-button />
    <!--
      The colour-blindness simulation filters live once, at the document root,
      so any preview can reference them by id without each instance minting its
      own SVG.
    -->
    <CvdFilters />
  </div>
</template>
