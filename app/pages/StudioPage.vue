<script setup lang="ts">
/**
 * The generator.
 *
 * Three columns on a wide screen: controls, the palette itself, previews.
 * The middle column is the point of the page, so the side panels collapse
 * before it does and the strip keeps the space it needs down to mobile.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Braces,
  Image as ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  ScanEye,
  Shuffle,
  Sliders,
} from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import { toast } from 'vue-sonner'
import SwatchStrip from '@/components/studio/SwatchStrip.vue'
import StudioToolbar from '@/components/studio/StudioToolbar.vue'
import AdjustDialog from '@/components/studio/AdjustDialog.vue'
import GeneratorPanel from '@/components/generator/GeneratorPanel.vue'
import HarmonyPanel from '@/components/generator/HarmonyPanel.vue'
import ScalePanel from '@/components/generator/ScalePanel.vue'
import ImagePanel from '@/components/generator/ImagePanel.vue'
import ExportPanel from '@/components/export/ExportPanel.vue'
import AccessibilityPanel from '@/components/a11y/AccessibilityPanel.vue'
import PreviewPane from '@/components/preview/PreviewPane.vue'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import { decodeState } from '@/lib/palette/url'

const palette = usePaletteStore()
const studio = useStudioStore()
const route = useRoute()
const router = useRouter()

const wide = useMediaQuery('(min-width: 1024px)')
const adjustingId = ref<string | null>(null)

const panels = [
  { value: 'generate', label: 'Ranges', icon: Sliders },
  { value: 'harmony', label: 'Harmony', icon: Shuffle },
  { value: 'scales', label: 'Scales', icon: Braces },
  { value: 'image', label: 'Image', icon: ImageIcon },
  { value: 'a11y', label: 'A11y', icon: ScanEye },
  { value: 'export', label: 'Export', icon: Save },
] as const

/** Load whatever the URL carries, once, before the first roll. */
onMounted(async () => {
  const encoded = route.params.state as string | undefined
  const initial = encoded ? await decodeState(encoded) : null
  palette.init(initial)
  if (initial) toast.success(`Loaded ${initial.colors.length} colors from the link`)
})

useKeyboardShortcuts()

// Keep the address bar in step with the palette so a copied URL is always the
// palette on screen. `replaceState` rather than push: Back must not become an
// accidental undo, and Safari silently drops pushState above ~100 per 30s.
let urlTimer: number | undefined
watch(
  () => palette.swatches,
  () => {
    window.clearTimeout(urlTimer)
    urlTimer = window.setTimeout(async () => {
      if (!palette.count) return
      const url = await palette.shareUrl()
      history.replaceState(history.state, '', url)
    }, 500)
  },
  { deep: false },
)

onUnmounted(() => window.clearTimeout(urlTimer))

const leftOpen = computed({
  get: () => studio.leftPanelOpen,
  set: (v: boolean) => (studio.leftPanelOpen = v),
})
const rightOpen = computed({
  get: () => studio.rightPanelOpen,
  set: (v: boolean) => (studio.rightPanelOpen = v),
})

function openAdjust(id: string) {
  adjustingId.value = id
}

async function copyLink() {
  const url = await palette.shareUrl()
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied', { description: 'It carries the whole palette — no account needed.' })
  } catch {
    toast.error('Could not reach the clipboard')
  }
}

void router
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <StudioToolbar @copy-link="copyLink" />

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Controls -->
      <aside
        v-if="leftOpen"
        class="scroll-slim flex w-full shrink-0 flex-col overflow-y-auto border-r bg-sidebar/40 lg:w-[22rem] xl:w-[24rem]"
        :class="!wide && 'absolute inset-y-0 left-0 z-30 bg-sidebar shadow-xl'"
      >
        <Tabs v-model="studio.activePanel" class="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList class="sticky top-0 z-10 h-auto w-full justify-start gap-0 rounded-none border-b bg-sidebar/95 p-0 backdrop-blur">
            <TabsTrigger
              v-for="panel in panels"
              :key="panel.value"
              :value="panel.value"
              class="flex-1 flex-col gap-0.5 rounded-none border-0 border-b-2 border-transparent px-1 py-2 text-[10px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <component :is="panel.icon" class="size-4" />
              {{ panel.label }}
            </TabsTrigger>
          </TabsList>

          <div class="min-h-0 flex-1 p-3">
            <TabsContent value="generate" class="mt-0"><GeneratorPanel /></TabsContent>
            <TabsContent value="harmony" class="mt-0"><HarmonyPanel /></TabsContent>
            <TabsContent value="scales" class="mt-0"><ScalePanel /></TabsContent>
            <TabsContent value="image" class="mt-0"><ImagePanel /></TabsContent>
            <TabsContent value="a11y" class="mt-0"><AccessibilityPanel /></TabsContent>
            <TabsContent value="export" class="mt-0"><ExportPanel /></TabsContent>
          </div>
        </Tabs>
      </aside>

      <!-- Palette -->
      <section class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SwatchStrip :format="studio.format" :cvd="studio.cvd" @adjust="openAdjust" />

        <!-- Panel handles, pinned to the strip's edges. -->
        <Button
          variant="secondary"
          size="icon-sm"
          class="absolute top-3 left-2 z-20 opacity-60 shadow-sm transition hover:opacity-100"
          :aria-label="leftOpen ? 'Hide controls' : 'Show controls'"
          @click="leftOpen = !leftOpen"
        >
          <PanelLeftClose v-if="leftOpen" />
          <PanelLeftOpen v-else />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          class="absolute top-3 right-2 z-20 opacity-60 shadow-sm transition hover:opacity-100"
          :aria-label="rightOpen ? 'Hide previews' : 'Show previews'"
          @click="rightOpen = !rightOpen"
        >
          <PanelRightClose v-if="rightOpen" />
          <PanelRightOpen v-else />
        </Button>
      </section>

      <!-- Previews -->
      <aside
        v-if="rightOpen && wide"
        class="scroll-slim w-[26rem] shrink-0 overflow-y-auto border-l bg-sidebar/40 xl:w-[32rem] 2xl:w-[40rem]"
      >
        <PreviewPane />
      </aside>
    </div>

    <AdjustDialog
      :swatch-id="adjustingId"
      @close="adjustingId = null"
    />
  </div>
</template>
