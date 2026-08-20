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
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <AppHeader />
    <main class="flex min-h-0 flex-1 flex-col">
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
