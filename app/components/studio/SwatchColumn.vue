<script setup lang="ts">
/**
 * One colour in the strip.
 *
 * The column paints itself from the colour and picks its own text colour by
 * APCA, so the controls stay legible whether the swatch is near-white or
 * near-black — the failure mode that makes most palette tools unusable at the
 * extremes.
 */
import { computed, nextTick, ref, watch } from 'vue'
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
import { apca, bestBlackOrWhite, faintestReadable } from '@/lib/color/contrast'
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
  /**
   * Which shape this cell is being asked to take. All four render the same
   * controls; only the alignment and the label treatment differ.
   */
  layout?: 'column' | 'tile' | 'row' | 'card'
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

const layout = computed(() => props.layout ?? 'column')

/**
 * How the cell arranges itself.
 *
 * A column is tall and thin so its label sits at the bottom; a tile is roughly
 * square so the label centres; a row is wide and short so the label runs along
 * it. Only the column is ever narrow enough to need the rotated label, which is
 * why the container-query rules are scoped to it.
 */
const shellClass = computed(() => {
  switch (layout.value) {
    case 'tile':
      return 'min-h-0 min-w-0 flex-col justify-center'
    case 'row':
      return 'min-h-0 min-w-0 flex-1 flex-row items-center justify-between'
    case 'card':
      return 'min-h-0 min-w-0 flex-col justify-end rounded-lg'
    default:
      return 'min-h-0 min-w-0 flex-1 flex-col justify-end'
  }
})

/** The rotated label is a column-only trick; a tile is never that narrow. */
const narrowRules = computed(() =>
  layout.value === 'column'
    ? '@max-[6rem]/swatch:flex-1 @max-[6rem]/swatch:justify-end @max-[6rem]/swatch:p-1 @max-[6rem]/swatch:pb-3 @max-[6rem]/swatch:[writing-mode:vertical-rl] @max-[6rem]/swatch:rotate-180'
    : '',
)

/** The value is full-width in a tall cell and intrinsic in a wide one. */
const valueClass = computed(() =>
  layout.value === 'row' ? 'w-auto shrink-0' : 'w-full',
)

/** In a row the name gets the leftover width; elsewhere it sits under the value. */
const nameClass = computed(() =>
  layout.value === 'row' ? 'min-w-0 flex-1 text-left' : 'max-w-full',
)

const labelClass = computed(() => {
  switch (layout.value) {
    case 'row':
      // Every row is indented the same: the panel-collapse button that the
      // first row used to make space for now lives in the toolbar, where it is
      // not on top of anything.
      return 'flex-row items-center gap-3 py-2 pr-28 pl-4'
    case 'tile':
      return 'items-center gap-0.5 p-2 text-center'
    case 'card':
      return 'items-center gap-1 p-2 pb-3 text-center'
    default:
      return 'items-center gap-1 p-3 pb-6 text-center sm:pb-8'
  }
})

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

/**
 * How solid the swatch's own chrome has to be to stay legible.
 *
 * The controls are drawn in the swatch's ink and faded, so what the eye gets is
 * the ink *composited over the swatch* — never the ink itself. A fixed fade
 * therefore made legibility a function of the colour underneath: at 0.7 it
 * costs 24–33 Lc, which white and near-black can spare and a mid-tone cannot.
 * Measured, #808080 fell from Lc 72 to 48 and the drag handle at 0.6 to Lc 40,
 * under the Lc 45 this app's own scale gives as the floor for an icon. The
 * buttons read as washed out until you hovered one, which restored full ink.
 *
 * Light and dark swatches solve back to the original 0.7 and look unchanged;
 * only the middle of the range firms up.
 */
/** Lc 60: small interactive icons, with headroom over the Lc 45 icon floor. */
const chromeIdle = computed(() =>
  faintestReadable(bestBlackOrWhite(props.swatch.color), props.swatch.color, 60),
)
/** The drag handle is secondary, so it may sit at the icon floor itself. */
const chromeIdleSoft = computed(() =>
  faintestReadable(bestBlackOrWhite(props.swatch.color), props.swatch.color, 45, 0.6),
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

const nameButton = ref<HTMLButtonElement | null>(null)

function startRename() {
  // Only ever the name the user actually gave. Pre-filling with `label` — the
  // curated or structural description — meant a swatch with no name opened the
  // field already holding text, and clicking away committed that text as a real
  // name: an undo step, a dirty palette, and a name that then stopped following
  // the colour. The description shows as the placeholder instead.
  draftName.value = props.swatch.name
  editing.value = true
}

/**
 * Finish renaming and put focus back where it came from.
 *
 * `editing` swaps the input for a button, so the element that had focus stops
 * existing and the browser drops focus on `<body>` — a keyboard user who
 * pressed Enter or Escape landed at the top of the document and had to tab all
 * the way back. Deliberately not applied when the input lost focus on its own:
 * the user is already somewhere else by then.
 */
function endRename(restoreFocus: boolean) {
  editing.value = false
  if (!restoreFocus) return
  void nextTick(() => nameButton.value?.focus())
}

function commitRename(restoreFocus = false) {
  const changed = draftName.value.trim() !== props.swatch.name
  endRename(restoreFocus)
  if (changed) emit('rename', draftName.value.trim())
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
    class="group/swatch @container/swatch relative flex overflow-hidden transition-[flex-grow] duration-300 ease-out"
    :class="[
      shellClass,
      dragging && 'opacity-40',
      swatch.locked && 'ring-inset ring-2 ring-[color:var(--swatch-ink)]/35',
    ]"
    :style="{
      background,
      color: textColor,
      '--swatch-ink': textColor,
      '--chrome-idle': chromeIdle,
      '--chrome-idle-soft': chromeIdleSoft,
    }"
    :data-layout="layout"
    :data-swatch-id="swatch.id"
    :aria-label="`Color ${index + 1} of ${total}: ${label}, ${display}`"
    role="group"
    tabindex="0"
    @keydown="onKeydown"
    @dragover.prevent="emit('dragOver', $event)"
    @drop.prevent="emit('drop', $event)"
  >
    <!--
      Controls: visible on hover, or always when the swatch is locked.

      Below about 9rem a horizontal row of five buttons is wider than the
      column, and because the column used to allow overflow they spilled over
      the neighbours — carrying this column's ink onto that column's
      background, which is why they looked like the wrong light or dark
      variant until you hovered the column they actually belonged to. The
      column now clips, and the row becomes a vertical stack before it ever
      needs to.
    -->
    <div
      class="absolute flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within/swatch:opacity-100 group-hover/swatch:opacity-100"
      :class="[
        layout === 'row'
          ? 'inset-y-0 right-0 items-center justify-end p-2'
          : 'inset-x-0 top-0 items-start justify-between p-2 @max-[9rem]/swatch:flex-col @max-[9rem]/swatch:items-center @max-[9rem]/swatch:p-1',
        swatch.locked && 'opacity-100',
      ]"
    >
      <button
        type="button"
        class="cursor-grab rounded-md p-1.5 opacity-(--chrome-idle-soft) transition-[opacity,background-color] hover:bg-current/12 hover:opacity-100 active:cursor-grabbing @max-[5rem]/swatch:hidden"
        :aria-label="`Drag to reorder ${label}`"
        draggable="true"
        @dragstart="emit('dragStart', $event)"
        @dragend="emit('dragEnd')"
      >
        <GripVertical class="size-4" />
      </button>

      <div class="flex items-center gap-0.5 @max-[9rem]/swatch:flex-col">
        <button
          type="button"
          class="rounded-md p-1.5 opacity-(--chrome-idle) transition-[opacity,background-color] hover:bg-current/12 hover:opacity-100"
          :aria-label="`Adjust ${label}`"
          title="Adjust this color"
          @click="emit('adjust')"
        >
          <SlidersHorizontal class="size-4" />
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 opacity-(--chrome-idle) transition-[opacity,background-color] hover:bg-current/12 hover:opacity-100 disabled:opacity-25"
          :aria-label="`Re-roll ${label}`"
          title="Generate a new color here"
          :disabled="swatch.locked"
          @click="emit('reroll')"
        >
          <RefreshCw class="size-4" />
        </button>
        <button
          type="button"
          class="rounded-md p-1.5 transition-[opacity,background-color] hover:bg-current/12"
          :class="swatch.locked ? 'opacity-100' : 'opacity-(--chrome-idle) hover:opacity-100'"
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
          class="rounded-md p-1.5 opacity-(--chrome-idle) transition-[opacity,background-color] hover:bg-current/12 hover:opacity-100"
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
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase opacity-80 @max-[7rem]/swatch:hidden"
      title="This color falls outside sRGB. It will be gamut-mapped on export to hex or rgb()."
    >
      Wide gamut
    </div>

    <!--
      The value and name. Below 6rem there is no horizontal room for a hex at
      all — it collapsed to an ellipsis and the name to a single letter — so
      the block turns on its side and reads bottom-to-top, which is what a
      narrow column has plenty of.
    -->
    <div class="flex flex-col" :class="[labelClass, narrowRules]">
      <button
        type="button"
        class="flex max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm font-semibold tracking-wide tabular-nums transition hover:bg-current/12 @max-[6rem]/swatch:w-auto @max-[6rem]/swatch:px-1 @max-[6rem]/swatch:py-2 @max-[6rem]/swatch:text-xs"
        :class="[valueClass, display.length > 22 ? 'text-[11px] sm:text-xs' : 'text-sm sm:text-base']"
        :style="{ opacity: chromeContrast > 45 ? 1 : 0.9 }"
        :aria-label="`Copy ${display}`"
        :title="display"
        @click="copy"
      >
        <!--
          `min-w-0` is what actually lets this truncate: a flex child defaults
          to min-width:auto and refuses to shrink below its content, so an
          oklch() value would otherwise run straight over the next column.
        -->
        <span class="min-w-0 truncate">{{ display }}</span>
        <Check v-if="copied" class="size-3.5 shrink-0" />
        <Copy
          v-else
          class="size-3.5 shrink-0 opacity-0 transition group-hover/swatch:opacity-60 @max-[8rem]/swatch:hidden"
        />
      </button>

      <input
        v-if="editing"
        v-model="draftName"
        class="w-full rounded border border-current/30 bg-current/10 px-1.5 py-0.5 text-xs outline-none"
        :class="layout === 'row' ? 'max-w-[24ch] text-left' : 'max-w-[18ch] text-center'"
        :placeholder="label"
        autofocus
        @blur="commitRename(false)"
        @keydown.enter.prevent="commitRename(true)"
        @keydown.esc.prevent="endRename(true)"
      />
      <button
        v-else
        ref="nameButton"
        type="button"
        class="truncate rounded px-1.5 py-0.5 text-xs opacity-(--chrome-idle) transition-[opacity,background-color] hover:bg-current/12 hover:opacity-100 @max-[4.5rem]/swatch:hidden"
        :class="nameClass"
        title="Click to rename"
        @click="startRename"
      >
        {{ label }}
      </button>
    </div>
  </div>
</template>
