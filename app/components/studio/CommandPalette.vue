<script setup lang="ts">
/**
 * The ⌘K command palette.
 *
 * Every action here is also reachable from a panel or a key; the palette exists
 * so nothing is more than one search away. Labels are written as static strings
 * rather than reflecting current state ("Toggle the controls", not "Hide the
 * controls") because the underlying list caches each item's text for filtering
 * when it mounts — a label that changes underneath it stops matching searches.
 */
import { Download, Eye, Palette, Sparkles } from '@lucide/vue'
import type { Component } from 'vue'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { CVD_IDS, CVD_TYPES } from '@/lib/color/cvd'
import { HARMONY_HINTS, HARMONY_IDS, HARMONY_LABELS } from '@/lib/color/harmony'
import { EMITTERS } from '@/lib/export/emitters'
import { usePaletteStore, type SortKey } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import { useThemeStore } from '@/stores/theme'

interface CommandAction {
  id: string
  label: string
  /** One line of context, shown greyed after the label. */
  hint?: string
  /** Rendered right-aligned when the action also has a key binding. */
  keys?: string
  run: () => void
}

interface CommandGroupDef {
  heading: string
  icon: Component
  items: CommandAction[]
}

const palette = usePaletteStore()
const studio = useStudioStore()
const theme = useThemeStore()

/**
 * The preview templates the studio can switch to. This mirrors the preview
 * registry; when `@/components/preview` exports its own manifest list, replace
 * this with that import so the two cannot diverge.
 */
const PREVIEW_TEMPLATES: Array<{ id: string; label: string }> = [
  { id: 'wordmark-grid', label: 'Wordmark grid' },
  { id: 'landing-hero', label: 'Landing hero' },
  { id: 'saas-dashboard', label: 'SaaS dashboard' },
  { id: 'mobile-app-screen', label: 'Mobile app screen' },
  { id: 'product-card-grid', label: 'Product card grid' },
  { id: 'blog-article', label: 'Blog article' },
  { id: 'pricing-table', label: 'Pricing table' },
  { id: 'chat-ui', label: 'Chat UI' },
]

const SORTS: Array<{ key: Exclude<SortKey, 'none'>; label: string }> = [
  { key: 'lightness', label: 'lightness' },
  { key: 'chroma', label: 'chroma' },
  { key: 'hue', label: 'hue' },
  { key: 'temperature', label: 'temperature' },
]

/** Mirrors the `-` key: the last color the user has not asked to keep. */
function removeLastUnlocked() {
  const last = [...palette.swatches].reverse().find((swatch) => !swatch.locked)
  if (last) palette.removeSwatch(last.id)
}

const groups: CommandGroupDef[] = [
  {
    heading: 'Generate',
    icon: Sparkles,
    items: [
      {
        id: 'gen-roll',
        label: 'Generate new colors',
        hint: 'Re-rolls every unlocked swatch',
        keys: 'Space',
        run: () => palette.roll(),
      },
      ...HARMONY_IDS.map((id) => ({
        id: `gen-harmony-${id}`,
        label: `Harmony: ${HARMONY_LABELS[id]}`,
        hint: HARMONY_HINTS[id].split('. ')[0],
        run: () => palette.applyHarmony(id),
      })),
      {
        id: 'gen-learn',
        label: 'Learn ranges from this palette',
        hint: 'Sets the generator to produce more like what is on screen',
        run: () => palette.learnConstraints(),
      },
    ],
  },
  {
    heading: 'Palette',
    icon: Palette,
    items: [
      { id: 'pal-add', label: 'Add a color', keys: '+', run: () => palette.addSwatch() },
      {
        id: 'pal-remove',
        label: 'Remove the last unlocked color',
        keys: '−',
        run: removeLastUnlocked,
      },
      { id: 'pal-shuffle', label: 'Shuffle the order', keys: 'S', run: () => palette.shuffle() },
      { id: 'pal-reverse', label: 'Reverse the order', run: () => palette.reverse() },
      ...SORTS.map((sort) => ({
        id: `pal-sort-${sort.key}`,
        label: `Sort by ${sort.label}`,
        run: () => palette.sortBy(sort.key),
      })),
      {
        id: 'pal-lock-all',
        label: 'Lock every color',
        keys: 'Shift L',
        run: () => palette.setAllLocks(true),
      },
      {
        id: 'pal-unlock-all',
        label: 'Unlock every color',
        keys: 'Shift U',
        run: () => palette.setAllLocks(false),
      },
      {
        id: 'pal-invert-locks',
        label: 'Invert every lock',
        keys: 'Shift I',
        run: () => palette.invertLocks(),
      },
    ],
  },
  {
    heading: 'View',
    icon: Eye,
    items: [
      {
        id: 'view-left',
        label: 'Toggle the controls panel',
        keys: '[',
        run: () => (studio.leftPanelOpen = !studio.leftPanelOpen),
      },
      {
        id: 'view-right',
        label: 'Toggle the previews panel',
        keys: ']',
        run: () => (studio.rightPanelOpen = !studio.rightPanelOpen),
      },
      {
        id: 'view-appearance',
        label: 'Toggle light and dark',
        hint: 'Changes the app chrome, not the palette',
        keys: 'D',
        run: () => theme.toggleAppearance(),
      },
      ...PREVIEW_TEMPLATES.map((template) => ({
        id: `view-template-${template.id}`,
        label: `Preview: ${template.label}`,
        run: () => (studio.previewTemplate = template.id),
      })),
      ...CVD_IDS.map((id) => ({
        id: `view-cvd-${id}`,
        label: id === 'none' ? 'Stop simulating color vision' : `Simulate ${CVD_TYPES[id].label}`,
        hint: CVD_TYPES[id].prevalence,
        run: () => (studio.cvd = id),
      })),
    ],
  },
  {
    heading: 'Export',
    icon: Download,
    items: EMITTERS.map((emitter) => ({
      id: `export-${emitter.id}`,
      label: `Export as ${emitter.label}`,
      hint: emitter.hint,
      run: () => studio.openPanel('export'),
    })),
  },
]

/** Running an action always dismisses the palette; nothing here is repeatable. */
function run(action: CommandAction) {
  action.run()
  studio.commandOpen = false
}
</script>

<template>
  <CommandDialog
    v-model:open="studio.commandOpen"
    title="Command palette"
    description="Search every action in the studio and run it with Enter."
  >
    <CommandInput placeholder="Search commands…" />
    <CommandList class="max-h-[22rem]">
      <CommandEmpty>No command matches that.</CommandEmpty>
      <CommandGroup v-for="group in groups" :key="group.heading" :heading="group.heading">
        <CommandItem
          v-for="item in group.items"
          :key="item.id"
          :value="item.id"
          class="gap-2"
          @select="run(item)"
        >
          <component :is="group.icon" />
          <span class="truncate">{{ item.label }}</span>
          <span v-if="item.hint" class="truncate text-xs text-muted-foreground">
            {{ item.hint }}
          </span>
          <CommandShortcut v-if="item.keys">{{ item.keys }}</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
