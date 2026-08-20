<script setup lang="ts">
/**
 * One colour in the strip.
 *
 * The column paints itself from the colour and picks its own text colour by
 * APCA, so the controls stay legible whether the swatch is near-white or
 * near-black — the failure mode that makes most palette tools unusable at the
 * extremes.
 */
import { computed, ref, watch } from 'vue'
import {
  Check,
  Copy,
  GripVertical,
  Lock,
  LockOpen,
  RefreshCw,
  SlidersHorizontal,
  X,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { formatColor } from '@/lib/color/convert'
import { apca, bestBlackOrWhite } from '@/lib/color/contrast'
import { describeColor, nearestName } from '@/lib/color/name'
import { isInGamut } from '@/lib/color/gamut'
import type { ColorFormat, Swatch } from '@/lib/color/types'

const props = defineProps<{
  swatch: Swatch
  index: number
  total: number
  format: ColorFormat
  canRemove: boolean
  /** Vertical layout on narrow viewports, horizontal columns otherwise. */
  stacked: boolean
  dragging: boolean
}>()

const emit = defineEmits<{
  lock: []
  remove: []
  reroll: []
  adjust: []
  rename: [value: string]
  dragStart: [event: DragEvent]
  dragOver: [event: DragEvent]
  drop: [event: DragEvent]
  dragEnd: []
  move: [delta: number]
}>()

const copied = ref(false)
const curatedName = ref('')

const textColor = computed(() => formatColor(bestBlackOrWhite(props.swatch.color), 'oklch'))
const background = computed(() => formatColor(props.swatch.color, 'oklch'))
const display = computed(() => formatColor(props.swatch.color, props.format))
const fallbackName = computed(() => describeColor(props.swatch.color))
const label = computed(() => props.swatch.name || curatedName.value || fallbackName.value)
const outOfGamut = computed(() => !isInGamut(props.swatch.color))

/** Lc of the control text against the swatch — used to fade the chrome. */
const chromeContrast = computed(() =>
  Math.abs(apca(bestBlackOrWhite(props.swatch.color), props.swatch.color)),
)

// The curated name list is a lazily loaded chunk, so the column renders
// immediately with a structural description and upgrades when it arrives.
watch(
  () => [props.swatch.color.l, props.swatch.color.c, props.swatch.color.h].join(),
  () => {
    const token = props.swatch.id
    void nearestName(props.swatch.color).then((result) => {
      if (props.swatch.id === token) curatedName.value = result.name
    })
  },
  { immediate: true },
)

async function copy() {
  try {
    await navigator.clipboard.writeText(display.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    toast.error('Could not reach the clipboard', {
      description: 'Your browser blocked it. Select the value and copy manually.',
    })
  }
}

const editing = ref(false)
const draftName = ref('')

function startRename() {
  draftName.value = props.swatch.name || label.value
  editing.value = true
}

function commitRename() {
  editing.value = false
  if (draftName.value.trim() !== props.swatch.name) emit('rename', draftName.value.trim())
}

function onKeydown(event: KeyboardEvent) {
  // Shift+Arrow reorders without a mouse: drag-and-drop alone locks keyboard
  // users out of rearranging a palette.
  if (!event.shiftKey) return
  const back = props.stacked ? 'ArrowUp' : 'ArrowLeft'
  const forward = props.stacked ? 'ArrowDown' : 'ArrowRight'
  if (event.key === back) {
    event.preventDefault()
    emit('move', -1)
  } else if (event.key === forward) {
    event.preventDefault()
    emit('move', 1)
  }
}
</script>

<template>
  <div
    class="group/swatch relative flex min-h-0 min-w-0 flex-1 flex-col justify-end transition-[flex-grow] duration-300 ease-out"
    :class="[
      dragging && 'opacity-40',
      swatch.locked && 'ring-inset ring-2 ring-[color:var(--swatch-ink)]/35',
    ]"
    :style="{ background, color: textColor, '--swatch-ink': textColor }"
    :data-swatch-id="swatch.id"
    :aria-label="`Color ${index + 1} of ${total}: ${label}, ${display}`"
    role="group"
    tabindex="0"
    @keydown="onKeydown"
    @dragover.prevent="emit('dragOver', $event)"
    @drop.prevent="emit('drop', $event)"
  >
    <!-- Controls: always visible when locked or focused, otherwise on hover. -->
    <div
      class="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2 opacity-0 transition-opacity duration-200 group-focus-within/swatch:opacity-100 group-hover/swatch:opacity-100"
      :class="swatch.locked && 'opacity-100'"
    >
      <button
        type="button"
        class="cursor-grab rounded-md p-1.5 opacity-60 transition hover:bg-current/12 hover:opacity-100 active:cursor-grabbing"
        :aria-label="`Drag to reorder ${label}`"
        draggable="true"
        @dragstart="emit('dragStart', $event)"
        @dragend="emit('dragEnd')"
      >
        <GripVertical class="size-4" />
      </button>

      <div class="flex items-center gap-0.5">
        <button
          type="button"
          class="rounded-md p-1.5 opacity-70 transition hover:bg-current/12 hover:opacity-100"
          :aria-label="`Adjust ${label}`"
          title="Adjust this color"
          @click="emit('adjust')"
        >
          <SlidersHorizontal class="size-4" />
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 opacity-70 transition hover:bg-current/12 hover:opacity-100 disabled:opacity-25"
          :aria-label="`Re-roll ${label}`"
          title="Generate a new color here"
          :disabled="swatch.locked"
          @click="emit('reroll')"
        >
          <RefreshCw class="size-4" />
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 transition hover:bg-current/12"
          :class="swatch.locked ? 'opacity-100' : 'opacity-70 hover:opacity-100'"
          :aria-label="swatch.locked ? `Unlock ${label}` : `Lock ${label}`"
          :aria-pressed="swatch.locked"
          :title="swatch.locked ? 'Unlock — this color will change again' : 'Lock — keep this color when generating'"
          @click="emit('lock')"
        >
          <Lock v-if="swatch.locked" class="size-4" />
          <LockOpen v-else class="size-4" />
        </button>
        <button
          v-if="canRemove"
          type="button"
          class="rounded-md p-1.5 opacity-70 transition hover:bg-current/12 hover:opacity-100"
          :aria-label="`Remove ${label}`"
          title="Remove this color"
          @click="emit('remove')"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <div
      v-if="outOfGamut"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase opacity-80"
      title="This color falls outside sRGB. It will be gamut-mapped on export to hex or rgb()."
    >
      Wide gamut
    </div>

    <div class="flex flex-col items-center gap-1 p-3 pb-6 text-center sm:pb-8">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wide tabular-nums transition hover:bg-current/12 sm:text-base"
        :style="{ opacity: chromeContrast > 45 ? 1 : 0.9 }"
        :aria-label="`Copy ${display}`"
        @click="copy"
      >
        <span class="max-w-[14ch] truncate sm:max-w-none">{{ display }}</span>
        <Check v-if="copied" class="size-3.5" />
        <Copy v-else class="size-3.5 opacity-0 transition group-hover/swatch:opacity-60" />
      </button>

      <input
        v-if="editing"
        v-model="draftName"
        class="w-full max-w-[18ch] rounded border border-current/30 bg-current/10 px-1.5 py-0.5 text-center text-xs outline-none"
        :placeholder="fallbackName"
        autofocus
        @blur="commitRename"
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="editing = false"
      />
      <button
        v-else
        type="button"
        class="max-w-full truncate rounded px-1.5 py-0.5 text-xs opacity-70 transition hover:bg-current/12 hover:opacity-100"
        title="Click to rename"
        @click="startRename"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
