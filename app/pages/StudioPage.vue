<script setup lang="ts">
/**
 * The generator.
 *
 * Three columns on a wide screen: controls, the palette itself, previews.
 * The middle column is the point of the page, so the side panels collapse
 * before it does and the strip keeps the space it needs down to mobile.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Braces, Image as ImageIcon, Save, ScanEye, Shuffle, Sliders } from '@lucide/vue'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { usePaletteStore } from '@/stores/palette'
import { useSessionStore } from '@/stores/session'
import { useStudioStore } from '@/stores/studio'
import type { GamutStrategy } from '@/lib/color/types'
import { decodeState, encodeState, type PaletteState } from '@/lib/palette/url'
import { formatColor } from '@/lib/color/convert'

const palette = usePaletteStore()
const studio = useStudioStore()
const session = useSessionStore()
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

/**
 * Apply a palette that arrived in the URL.
 *
 * One definition for both entry points. They used to be written twice and had
 * drifted: mounting with a link in the address bar called `init()`, which
 * clears the undo history, while a link pasted while already in the studio
 * called `loadState()`, which does not. So the same action — opening a
 * colleague's link — either cost you twenty minutes of undo or did not,
 * depending on which route you happened to be standing on. It never should.
 */
async function applyIncoming(next: PaletteState | null) {
  if (!next?.colors.length) return
  const incoming = next.colors.map((c) => formatColor(c, 'hex')).join()
  if (incoming === palette.hexes.join()) return
  if (palette.count) palette.loadState(next, 'Open shared palette')
  else palette.init(next)
  toast.success(`Loaded ${next.colors.length} colors from the link`)
}

/**
 * Restore the palette on mount.
 *
 * The guard matters: this component remounts every time you visit the theme
 * editor and come back, and re-initialising unconditionally rolled a brand-new
 * random palette each time. The work in progress simply vanished — and because
 * the replacement had a different average lightness, the preview would also
 * flip between light and dark for no reason the user could see.
 *
 * A palette in the URL always wins; otherwise an existing palette is kept, and
 * only a genuinely empty store gets a fresh roll.
 */
onMounted(async () => {
  const encoded = route.params.state as string | undefined
  // Decoded, not merely present: `/p/:state` matches any junk a chat client
  // may have wrapped or truncated, and returning on the parameter alone left
  // the studio with no palette at all and no way to make one but the count
  // button.
  const incoming = typeof encoded === 'string' && encoded ? await decodeState(encoded) : null
  if (incoming) {
    await applyIncoming(incoming)
    return
  }
  if (encoded) {
    toast.error('That link could not be read', {
      description: 'It looks truncated. Here is a fresh palette instead.',
    })
  }
  if (!palette.count) {
    /*
     * The instance's own generator defaults, for a first palette only.
     *
     * `engine.defaultGamut` and `engine.defaultSwatchCount` are settings an
     * administrator can change and nothing read, so the Settings tab saved
     * them and every visitor still got the values baked into the client. They
     * apply here and only here: once someone has a palette, their choices win.
     */
    const defaults = session.meta?.defaults
    if (studio.usingDefaults && defaults) {
      if (defaults.gamut) palette.constraints.gamut = defaults.gamut as GamutStrategy
      const count = Number(defaults.swatchCount)
      if (Number.isFinite(count) && count >= 1) palette.setDefaultCount(count)
    }
    palette.init(null)
  }
})

/**
 * Load a palette when the route's state parameter changes.
 *
 * `onMounted` alone is not enough: vue-router reuses this component when only
 * a parameter changes, so pasting a share link while already in the studio
 * updated the address bar and nothing else. The comparison inside
 * `applyIncoming` is what stops this fighting the sync below, which rewrites
 * the same parameter every time a colour moves.
 */
watch(
  () => route.params.state,
  async (encoded) => {
    if (typeof encoded !== 'string' || !encoded) return
    // Our own write, echoed back. Decoding and comparing colours is not enough:
    // the palette may have moved on again in the meantime, and the stale value
    // would then be applied over the newer edit.
    if (encoded === selfWritten) return
    await applyIncoming(await decodeState(encoded))
  },
)

useKeyboardShortcuts()

/*
 * Keep the address bar in step with the palette so a copied URL is always the
 * palette on screen.
 *
 * Through the router, not `history.replaceState`. Writing the URL directly
 * left vue-router believing it was still on the bare `studio` record: the
 * address bar said `#/p/…` while `route.params.state` stayed undefined, so
 * clicking "Generator" in the header was a no-op, and coming back to the
 * studio from another page re-read a stale route and threw the palette away.
 *
 * `replace` rather than `push`: Back must not become an accidental undo, and
 * Safari silently drops pushState above about a hundred calls per thirty
 * seconds.
 */
let urlTimer: number | undefined
/** The last value this page wrote, so its own write is not read back as an incoming link. */
let selfWritten: string | null = null
let leaving = false

watch(
  () => palette.swatches,
  () => {
    window.clearTimeout(urlTimer)
    urlTimer = window.setTimeout(async () => {
      if (leaving || !palette.count) return
      const state = await encodeState(palette.toState())
      // Re-checked after the await: the user may have navigated away, and a
      // pending replace would then pull them back to the studio.
      if (leaving || route.params.state === state) return
      selfWritten = state
      void router.replace({ name: 'shared', params: { state } })
    }, 500)
  },
  { deep: false },
)

onBeforeRouteLeave(() => {
  leaving = true
  window.clearTimeout(urlTimer)
})

onUnmounted(() => window.clearTimeout(urlTimer))

/**
 * Below `lg` both panels are sheets over the palette rather than columns
 * beside it, so an open one hides the thing the page is for.
 *
 * They get their own state at that width, and it starts closed. Writing the
 * store instead meant one visit on a phone — or one narrow window — persisted
 * "both panels closed" and the next desktop session opened with no controls
 * and no previews, a preference the user never expressed.
 */
const leftSheet = ref(false)
const rightSheet = ref(false)

const leftOpen = computed({
  get: () => (wide.value ? studio.leftPanelOpen : leftSheet.value),
  set: (v: boolean) => {
    if (wide.value) studio.leftPanelOpen = v
    else leftSheet.value = v
  },
})
const rightOpen = computed({
  get: () => (wide.value ? studio.rightPanelOpen : rightSheet.value),
  set: (v: boolean) => {
    if (wide.value) studio.rightPanelOpen = v
    else rightSheet.value = v
  },
})

// One sheet at a time: two full-width sheets stacked have no legible z-order.
watch(leftSheet, (open) => {
  if (open) rightSheet.value = false
})
watch(rightSheet, (open) => {
  if (open) leftSheet.value = false
})

/*
 * The keyboard shortcuts and the command palette write the stored preference
 * directly. At sheet widths that value is not what is on screen, so a change
 * to it is read as "the user asked to toggle" and mirrored onto the sheet.
 */
watch(
  () => studio.leftPanelOpen,
  () => {
    if (!wide.value) leftSheet.value = !leftSheet.value
  },
)
watch(
  () => studio.rightPanelOpen,
  () => {
    if (!wide.value) rightSheet.value = !rightSheet.value
  },
)
watch(
  () => studio.activePanel,
  () => {
    if (!wide.value) leftSheet.value = true
  },
)

function closeSheets() {
  leftSheet.value = false
  rightSheet.value = false
}

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
</script>

<template>
  <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <StudioToolbar
      :left-open="leftOpen"
      :right-open="rightOpen"
      @copy-link="copyLink"
      @toggle-panel="(side) => (side === 'left' ? (leftOpen = !leftOpen) : (rightOpen = !rightOpen))"
    />

    <!--
      `relative` anchors the narrow-screen drawer to this row. Without it the
      drawer resolved against whichever ancestor happened to be positioned and
      slid up over the toolbar, hiding the controls the user needs to get back.
    -->
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <!--
        Below `lg` the side panels become sheets over the palette, so they need
        a way out that does not depend on finding a control underneath them.
      -->
      <div
        v-if="(leftOpen || rightOpen) && !wide"
        class="absolute inset-0 z-20 bg-black/50"
        role="button"
        tabindex="0"
        aria-label="Close the open panel"
        @click="closeSheets"
        @keydown.enter.stop.prevent="closeSheets"
        @keydown.space.stop.prevent="closeSheets"
      />

      <!-- Controls -->
      <!--
        The tab bar is a real header and the panel body is the scroll
        container, rather than the whole column scrolling with a `sticky` bar
        inside it. Sticky only travels within its own containing block, and
        that block was the flex line — one viewport tall — so the bar came
        unstuck about eight hundred pixels down a long panel and the only way
        back to another tab was to scroll to the top first.

        The background is set in the binding rather than the static class list:
        `bg-sidebar/40` and `bg-sidebar` are the same Tailwind property, so
        which one applied to the drawer came down to their order in the
        generated stylesheet — and the 40% one was winning, leaving the palette
        legible straight through the controls.
      -->
      <aside
        v-if="leftOpen"
        class="flex shrink-0 flex-col overflow-hidden border-r"
        :class="
          wide
            ? 'relative w-full bg-sidebar/40 lg:w-[22rem] xl:w-[24rem]'
            : 'absolute inset-y-0 left-0 z-30 w-[min(22rem,88%)] bg-sidebar shadow-xl'
        "
      >
        <Tabs v-model="studio.activePanel" class="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList class="z-10 h-auto w-full shrink-0 justify-start gap-0 rounded-none border-b bg-sidebar/95 p-0 backdrop-blur">
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

          <!--
            `relative` on the scroll container is load-bearing: an absolutely
            positioned descendant with no positioned ancestor — a bare
            `.sr-only` label — otherwise resolves against the document, escapes
            this box entirely and drags the page's scroll height down with it.

            The padding lives on the inner box rather than on the scroller,
            because a scroll container's own bottom padding is not reliably part
            of its scrollable area. Inside, it is ordinary content, so the last
            control in a long panel keeps its distance from the edge.
          -->
          <div
            class="scroll-slim relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
          >
            <div class="min-w-0 p-3 pb-6">
              <TabsContent value="generate" class="mt-0"><GeneratorPanel /></TabsContent>
              <TabsContent value="harmony" class="mt-0"><HarmonyPanel /></TabsContent>
              <TabsContent value="scales" class="mt-0"><ScalePanel /></TabsContent>
              <TabsContent value="image" class="mt-0"><ImagePanel /></TabsContent>
              <TabsContent value="a11y" class="mt-0"><AccessibilityPanel /></TabsContent>
              <TabsContent value="export" class="mt-0"><ExportPanel /></TabsContent>
            </div>
          </div>
        </Tabs>
      </aside>

      <!--
        Palette.

        The panel handles used to be pinned to this section's top corners,
        where they sat exactly on top of the first swatch's drag grip and the
        last swatch's remove button and swallowed both clicks. They live in the
        toolbar now — always in the same place, never over a swatch, and
        reachable at every width.
      -->
      <section class="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SwatchStrip
          :format="studio.format"
          :cvd="studio.cvd"
          :view="studio.paletteView"
          @adjust="openAdjust"
        />
      </section>

      <!-- Previews -->
      <aside
        v-if="rightOpen"
        class="scroll-slim overflow-x-hidden overflow-y-auto border-l [scrollbar-gutter:stable]"
        :class="
          wide
            ? 'relative w-[26rem] shrink-0 bg-sidebar/40 xl:w-[32rem] 2xl:w-[40rem]'
            : 'absolute inset-y-0 right-0 z-30 w-[min(32rem,92%)] bg-sidebar shadow-xl'
        "
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
