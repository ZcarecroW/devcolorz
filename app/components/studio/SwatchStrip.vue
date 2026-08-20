<script setup lang="ts">
/**
 * The palette strip.
 *
 * Columns on desktop, stacked rows on narrow screens. Drag to reorder,
 * Shift+Arrow to reorder from the keyboard, and a hairline insert control
 * between every pair that adds the colour *between* its neighbours rather than
 * a random one — inserting between two colours almost always means "give me
 * the step in between".
 */
import { computed, ref } from 'vue'
import { Plus } from '@lucide/vue'
import { useMediaQuery } from '@vueuse/core'
import SwatchColumn from '@/components/studio/SwatchColumn.vue'
import { usePaletteStore, MAX_SWATCHES, MIN_SWATCHES } from '@/stores/palette'
import type { ColorFormat } from '@/lib/color/types'

const props = defineProps<{
  format: ColorFormat
  /** Which colour-vision deficiency to simulate, if any. */
  cvd?: string
}>()

const emit = defineEmits<{ adjust: [id: string] }>()

const palette = usePaletteStore()
const stacked = useMediaQuery('(max-width: 767px)')

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

const canRemove = computed(() => palette.count > MIN_SWATCHES)
const canAdd = computed(() => palette.count < MAX_SWATCHES)

const filter = computed(() =>
  props.cvd && props.cvd !== 'none' ? `url(#cvd-${props.cvd})` : undefined,
)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, event: DragEvent) {
  overIndex.value = index
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onDrop(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    palette.moveSwatch(dragIndex.value, index)
  }
  dragIndex.value = null
  overIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  overIndex.value = null
}

function move(index: number, delta: number) {
  palette.moveSwatch(index, Math.max(0, Math.min(palette.count - 1, index + delta)))
}
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col md:flex-row"
    :style="filter ? { filter } : undefined"
    role="list"
    aria-label="Palette colors"
  >
    <template v-for="(swatch, index) in palette.swatches" :key="swatch.id">
      <SwatchColumn
        :swatch="swatch"
        :index="index"
        :total="palette.count"
        :format="format"
        :can-remove="canRemove"
        :stacked="stacked"
        :dragging="dragIndex === index"
        role="listitem"
        @lock="palette.toggleLock(swatch.id)"
        @remove="palette.removeSwatch(swatch.id)"
        @reroll="palette.rollOne(swatch.id)"
        @adjust="emit('adjust', swatch.id)"
        @rename="palette.setName(swatch.id, $event)"
        @drag-start="onDragStart(index, $event)"
        @drag-over="onDragOver(index, $event)"
        @drop="onDrop(index)"
        @drag-end="onDragEnd"
        @move="move(index, $event)"
      />

      <!--
        The insert affordance. Zero-width until hovered so it never steals
        space from the palette, which is the thing people came to look at.
      -->
      <div
        v-if="canAdd && index < palette.count - 1"
        class="group/insert relative z-10 flex shrink-0 items-center justify-center md:w-0"
      >
        <button
          type="button"
          class="absolute flex size-7 items-center justify-center rounded-full border border-border bg-background text-foreground opacity-0 shadow-sm transition-all duration-150 hover:scale-110 hover:opacity-100 focus-visible:opacity-100 group-hover/insert:opacity-100"
          :aria-label="`Insert a color between position ${index + 1} and ${index + 2}`"
          title="Insert the midpoint of these two colors"
          @click="palette.addSwatch(index + 1)"
        >
          <Plus class="size-4" />
        </button>
      </div>
    </template>
  </div>
</template>
