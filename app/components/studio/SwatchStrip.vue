<script setup lang="ts">
/**
 * The palette surface.
 *
 * Four layouts, because one shape does not serve five colours and forty. The
 * columns everyone recognises from palette tools stop working somewhere around
 * ten, where each strip becomes a sliver; `boxes` takes over from there by
 * filling the whole area with near-square tiles. `rows` lines colours up along
 * one axis, which is the easiest way to judge lightness order, and `cards`
 * trades density for keeping every name and value on screen at once.
 *
 * All four render the same `SwatchColumn`, so locking, renaming, reordering and
 * the keyboard shortcuts behave identically in every one.
 */
import { computed, ref, useTemplateRef } from 'vue'
import { Plus } from '@lucide/vue'
import { useElementSize, useMediaQuery } from '@vueuse/core'
import SwatchColumn from '@/components/studio/SwatchColumn.vue'
import { usePaletteStore, MAX_SWATCHES, MIN_SWATCHES } from '@/stores/palette'
import { planGrid, type PaletteView } from '@/lib/palette/layout'
import type { ColorFormat } from '@/lib/color/types'

const props = defineProps<{
  format: ColorFormat
  /** Which colour-vision deficiency to simulate, if any. */
  cvd?: string
  view: PaletteView
}>()

const emit = defineEmits<{ adjust: [id: string] }>()

const palette = usePaletteStore()
const stacked = useMediaQuery('(max-width: 767px)')

const surface = useTemplateRef<HTMLElement>('surface')
const { width, height } = useElementSize(surface)

const dragIndex = ref<number | null>(null)
/**
 * The swatch under the dragged one, outlined so the drop has a visible target.
 * It was tracked and never drawn, so reordering was a guess past the browser's
 * own drag ghost — in the grid layouts especially, where "next to" is not the
 * obvious neighbour.
 */
const overIndex = ref<number | null>(null)

const canRemove = computed(() => palette.count > MIN_SWATCHES)
const canAdd = computed(() => palette.count < MAX_SWATCHES)

const filter = computed(() =>
  props.cvd && props.cvd !== 'none' ? `url(#cvd-${props.cvd})` : undefined,
)

/**
 * Columns are the default, but they degrade badly past a dozen swatches on a
 * narrow viewport, so on a phone the strip always stacks.
 */
const effectiveView = computed<PaletteView>(() =>
  stacked.value && props.view === 'columns' ? 'rows' : props.view,
)

const GAP = 0

const plan = computed(() =>
  planGrid(palette.count, width.value || 1200, height.value || 600, { gap: GAP }),
)

/** Cards keep a readable minimum size and let the surface scroll instead. */
const cardColumns = computed(() => Math.max(1, Math.floor((width.value || 1200) / 190)))

const cellLayout = computed(() => {
  switch (effectiveView.value) {
    case 'boxes':
      return 'tile' as const
    case 'rows':
      return 'row' as const
    case 'cards':
      return 'card' as const
    default:
      return 'column' as const
  }
})

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

/** Grid geometry for the layouts that use CSS grid. */
const gridStyle = computed(() => {
  if (effectiveView.value === 'boxes') {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${plan.value.columns}, minmax(0, 1fr))`,
      gridAutoRows: 'minmax(0, 1fr)',
    }
  }
  if (effectiveView.value === 'cards') {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cardColumns.value}, minmax(0, 1fr))`,
      gridAutoRows: '9rem',
      gap: '0.5rem',
      padding: '0.5rem',
      alignContent: 'start',
    }
  }
  return undefined
})

const spanFor = (index: number) =>
  effectiveView.value === 'boxes' && plan.value.spans[index] > 1
    ? { gridColumn: `span ${plan.value.spans[index]}` }
    : undefined
</script>

<template>
  <div
    ref="surface"
    class="relative flex min-h-0 min-w-0 flex-1"
    :class="[
      effectiveView === 'columns' && 'flex-row',
      effectiveView === 'rows' && 'flex-col',
      effectiveView === 'cards' && 'overflow-y-auto scroll-slim',
    ]"
    :style="[filter ? { filter } : {}, gridStyle ?? {}]"
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
        :layout="cellLayout"
        :dragging="dragIndex === index"
        :style="spanFor(index)"
        :class="
          dragIndex !== null &&
          overIndex === index &&
          dragIndex !== index &&
          'outline-2 -outline-offset-2 outline-dashed outline-foreground/70'
        "
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
        The insert affordance, for the two layouts where "between these two"
        has an unambiguous meaning. In a grid the neighbour depends on where
        the row happens to wrap, so it would be a promise the layout cannot
        keep; the toolbar's plus button adds to the end there instead.
      -->
      <div
        v-if="
          canAdd &&
          index < palette.count - 1 &&
          (effectiveView === 'columns' || effectiveView === 'rows')
        "
        class="group/insert relative z-10 flex shrink-0 items-center justify-center"
        :class="effectiveView === 'columns' ? 'w-0' : 'h-0'"
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

    <!-- Cards scroll, so a trailing tile is the natural place to add one. -->
    <button
      v-if="canAdd && effectiveView === 'cards'"
      type="button"
      class="flex items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      aria-label="Add a color"
      title="Add a color"
      @click="palette.addSwatch()"
    >
      <Plus class="size-5" />
    </button>
  </div>
</template>
