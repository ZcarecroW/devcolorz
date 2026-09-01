<script setup lang="ts">
/**
 * Every colour in the palette scored against every other one.
 *
 * The grid is painted from the palette itself: a cell is filled with the
 * background colour and its number is drawn in the foreground colour, so the
 * cell *is* the readability test rather than a description of one. The
 * pass/fail marker is drawn in whichever of black or white reads on that fill —
 * the only treatment that stays legible on a colour we do not control, and the
 * only one that survives the shrink to ~12px cells a twenty-colour palette
 * forces. Below 28px the numbers go and the colour coding carries the grid.
 */
import { computed, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import InfoHint from '@/components/common/InfoHint.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { css } from '@/lib/color/convert'
import {
  apcaVerdict,
  bestBlackOrWhite,
  contrastMatrix,
  makeReadable,
  wcagLevel,
  type ContrastMetric,
} from '@/lib/color/contrast'
import { describeColor } from '@/lib/color/name'
import type { Oklch, Swatch } from '@/lib/color/types'

const props = defineProps<{
  swatches: Swatch[]
  metric: ContrastMetric
}>()

const emit = defineEmits<{
  /** The caller owns history, so the corrected colour goes back up rather than
   *  being written here. */
  fix: [id: string, color: Oklch]
}>()

/** How a pair rates, in terms both metrics can express. */
type Grade = 'body' | 'ui' | 'fail'

const container = ref<HTMLElement | null>(null)
// A sensible starting width keeps the first paint from flashing at the 10px
// minimum before the observer reports the real size.
const { width } = useElementSize(container, { width: 320, height: 0 })

const colors = computed(() => props.swatches.map((s) => s.color))
const size = computed(() => props.swatches.length)

const fills = computed(() => colors.value.map((c) => css(c)))
/** Black or white per column, so a marker on that fill is always visible. */
const markers = computed(() => colors.value.map((c) => css(bestBlackOrWhite(c))))
const labels = computed(() => props.swatches.map((s) => s.name || describeColor(s.color)))

// Both metrics are computed for every pair, not just the active one: the detail
// popover always shows the pair judged both ways, which is the whole argument
// for offering two metrics in the first place.
const ratios = computed(() => contrastMatrix(colors.value, 'wcag'))
const lightnessContrasts = computed(() => contrastMatrix(colors.value, 'apca'))

const gap = computed(() => (size.value > 12 ? 1 : 2))

/**
 * Cells shrink to fit the panel, but never below 24px: every cell is a button,
 * and 24×24 is the smallest target a finger can be expected to hit. Past that
 * the grid scrolls sideways instead — a matrix of forty colours used to fit
 * itself into the sidebar at ten pixels a cell, inside the one panel whose
 * job is accessibility.
 */
const cellSize = computed(() => {
  const columns = size.value + 1
  const usable = width.value - gap.value * (columns - 1)
  return Math.max(24, Math.min(44, Math.floor(usable / columns)))
})

/** Below this the digits turn to mush, so the colour coding carries the grid. */
const showNumbers = computed(() => cellSize.value >= 28)
const numberSize = computed(() => Math.max(9, Math.min(12, Math.round(cellSize.value * 0.34))))
const markerSize = computed(() => (cellSize.value >= 24 ? 5 : 3))

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${size.value + 1}, ${cellSize.value}px)`,
  gap: `${gap.value}px`,
  width: 'max-content',
}))

const bodyTarget = computed(() => (props.metric === 'apca' ? 75 : 4.5))

function gradeFor(ratio: number, lc: number): Grade {
  if (props.metric === 'wcag') {
    const level = wcagLevel(ratio)
    if (level === 'AAA' || level === 'AA') return 'body'
    return level === 'AA Large' ? 'ui' : 'fail'
  }
  if (Math.abs(lc) >= 75) return 'body'
  return apcaVerdict(lc).ok ? 'ui' : 'fail'
}

function badgeFor(ratio: number, lc: number): string {
  return props.metric === 'wcag' ? wcagLevel(ratio) : apcaVerdict(lc).label
}

function displayFor(ratio: number, lc: number): string {
  if (props.metric === 'wcag') return ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)
  return String(Math.round(lc))
}

function grade(row: number, col: number): Grade {
  return gradeFor(ratios.value[row][col], lightnessContrasts.value[row][col])
}

function display(row: number, col: number): string {
  return displayFor(ratios.value[row][col], lightnessContrasts.value[row][col])
}

function cellLabel(row: number, col: number): string {
  const ratio = ratios.value[row][col]
  const lc = lightnessContrasts.value[row][col]
  const value =
    props.metric === 'wcag' ? `${ratio.toFixed(2)} to 1` : `Lc ${Math.round(lc)}`
  return `${labels.value[row]} on ${labels.value[col]}: ${value}, ${badgeFor(ratio, lc)}`
}

/** A hairline diagonal, drawn in the marker colour. Reads at any cell size. */
function slashStyle(col: number) {
  const marker = markers.value[col]
  return {
    background: `linear-gradient(to top right, transparent calc(50% - 0.5px), ${marker} calc(50% - 0.5px), ${marker} calc(50% + 0.5px), transparent calc(50% + 0.5px))`,
    opacity: '0.5',
  }
}

function dotStyle(row: number, col: number) {
  const marker = markers.value[col]
  const filled = grade(row, col) === 'body'
  return {
    right: '2px',
    bottom: '2px',
    width: `${markerSize.value}px`,
    height: `${markerSize.value}px`,
    background: filled ? marker : 'transparent',
    boxShadow: filled ? 'none' : `inset 0 0 0 1px ${marker}`,
    opacity: '0.8',
  }
}

/* ---------------- detail popover ---------------- */

const active = ref<{ row: number; col: number } | null>(null)
const detailOpen = ref(false)

// One popover for the whole grid rather than one per cell: at twenty colours
// that would be four hundred floating-ui instances. The anchor is an empty box
// parked over the selected cell, which we can place from the indices alone.
const anchorStyle = computed(() => {
  const cell = active.value
  const step = cellSize.value + gap.value
  if (!cell) return { left: '0px', top: '0px', width: '0px', height: '0px' }
  return {
    left: `${(cell.col + 1) * step}px`,
    top: `${(cell.row + 1) * step}px`,
    width: `${cellSize.value}px`,
    height: `${cellSize.value}px`,
  }
})

const detail = computed(() => {
  const cell = active.value
  if (!cell) return null
  const text = props.swatches[cell.row]
  const background = props.swatches[cell.col]
  if (!text || !background) return null
  const ratio = ratios.value[cell.row][cell.col]
  const lc = lightnessContrasts.value[cell.row][cell.col]
  return {
    text,
    background,
    textLabel: labels.value[cell.row],
    backgroundLabel: labels.value[cell.col],
    textCss: fills.value[cell.row],
    backgroundCss: fills.value[cell.col],
    ratio,
    lc,
    level: wcagLevel(ratio),
    verdict: apcaVerdict(lc),
    grade: gradeFor(ratio, lc),
    repair: makeReadable(text.color, background.color, {
      metric: props.metric,
      target: bodyTarget.value,
    }),
  }
})

const fixLabel = computed(() =>
  props.metric === 'wcag' ? 'Raise this text to 4.5:1' : 'Raise this text to Lc 75',
)

/**
 * The cell the detail popover was opened from.
 *
 * The popover has no `PopoverTrigger` — it is anchored to a position, not to
 * an element — so reka has no trigger to hand focus back to and dropped it on
 * `<body>` when the popover closed. A keyboard user reading down a column lost
 * their place on every cell they inspected.
 */
const activeCell = ref<HTMLElement | null>(null)

function open(row: number, col: number, cell: HTMLElement | null) {
  activeCell.value = cell
  active.value = { row, col }
  detailOpen.value = true
}

function restoreFocus(event: Event) {
  event.preventDefault()
  activeCell.value?.focus()
}

function applyFix() {
  const current = detail.value
  if (!current?.repair) return
  emit('fix', current.text.id, current.repair)
  detailOpen.value = false
}

// A shorter palette can leave the selection pointing at a colour that is gone.
watch(size, () => {
  active.value = null
  detailOpen.value = false
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-1">
      <span class="text-xs font-medium">Contrast matrix</span>
      <InfoHint
        title="Reading the matrix"
        wide
        text="Each column is a background and each row is the text drawn on it, so a cell shows the row's color rendered on the column's color — the pair as it would actually appear. A filled dot means the pair carries body text, a hollow dot means it is only good enough for large text, icons and borders, and a diagonal line means it fails outright. Click any cell for both metrics and a one-click correction."
      />
      <span class="flex-1" />
      <span class="text-[10px] text-muted-foreground">{{ size }} × {{ size }}</span>
    </div>

    <div ref="container" class="relative overflow-x-auto pb-1">
      <div class="grid" :style="gridStyle">
        <!-- Corner: carries the axis explanation for screen readers. -->
        <div :style="{ width: `${cellSize}px`, height: `${cellSize}px` }">
          <span class="sr-only">
            Rows are the text color, columns are the background color.
          </span>
        </div>

        <div
          v-for="(swatch, index) in swatches"
          :key="`col-${swatch.id}`"
          class="rounded-sm"
          :style="{ background: fills[index], width: `${cellSize}px`, height: `${cellSize}px` }"
          :title="`${labels[index]} — as a background`"
        />

        <template v-for="(rowSwatch, row) in swatches" :key="`row-${rowSwatch.id}`">
          <div
            class="rounded-sm"
            :style="{ background: fills[row], width: `${cellSize}px`, height: `${cellSize}px` }"
            :title="`${labels[row]} — as text`"
          />
          <button
            v-for="(colSwatch, col) in swatches"
            :key="`${rowSwatch.id}-${colSwatch.id}`"
            type="button"
            class="relative flex items-center justify-center overflow-hidden rounded-sm focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-default"
            :class="
              active && active.row === row && active.col === col
                ? 'z-10 outline-2 outline-offset-1 outline-ring'
                : ''
            "
            :style="{ background: fills[col], width: `${cellSize}px`, height: `${cellSize}px` }"
            :disabled="row === col"
            :aria-label="row === col ? `${labels[row]} on itself` : cellLabel(row, col)"
            @click="open(row, col, $event.currentTarget as HTMLElement)"
          >
            <template v-if="row !== col">
              <span
                v-if="showNumbers"
                class="font-mono leading-none tabular-nums"
                :style="{ color: fills[row], fontSize: `${numberSize}px` }"
              >
                {{ display(row, col) }}
              </span>
              <span
                v-if="grade(row, col) === 'fail'"
                class="pointer-events-none absolute inset-0"
                :style="slashStyle(col)"
              />
              <span
                v-else
                class="pointer-events-none absolute rounded-full"
                :style="dotStyle(row, col)"
              />
            </template>
          </button>
        </template>
      </div>

      <Popover v-model:open="detailOpen">
        <PopoverAnchor as="span" class="pointer-events-none absolute block" :style="anchorStyle" />
        <PopoverContent
          v-if="detail"
          side="right"
          align="start"
          class="w-72 p-3"
          :collision-padding="12"
          aria-labelledby="contrast-detail-title"
          @close-auto-focus="restoreFocus"
        >
          <div class="flex flex-col gap-3">
            <div>
              <p id="contrast-detail-title" class="text-xs font-semibold tracking-tight">
                {{ detail.textLabel }} on {{ detail.backgroundLabel }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                Row color as text, column color as background.
              </p>
            </div>

            <div
              class="rounded-md px-3 py-2"
              :style="{ background: detail.backgroundCss, color: detail.textCss }"
            >
              <p class="text-[13px] leading-snug">Body copy at 13px, the size most UI text is.</p>
              <p class="text-base font-semibold">Heading</p>
            </div>

            <dl class="grid grid-cols-2 gap-2 text-[11px]">
              <div class="rounded-md border bg-card/40 px-2 py-1.5">
                <dt class="text-muted-foreground">WCAG 2.x</dt>
                <dd class="font-mono text-sm tabular-nums">{{ detail.ratio.toFixed(2) }}:1</dd>
                <dd class="text-muted-foreground">{{ detail.level }}</dd>
              </div>
              <div class="rounded-md border bg-card/40 px-2 py-1.5">
                <dt class="text-muted-foreground">APCA</dt>
                <dd class="font-mono text-sm tabular-nums">Lc {{ Math.round(detail.lc) }}</dd>
                <dd class="text-muted-foreground">{{ detail.verdict.label }}</dd>
              </div>
            </dl>

            <p class="text-[11px] leading-snug text-muted-foreground">
              {{ detail.verdict.use }}
            </p>

            <Button
              v-if="detail.grade !== 'body'"
              size="sm"
              class="w-full"
              :disabled="!detail.repair"
              @click="applyFix"
            >
              {{ fixLabel }}
            </Button>
            <p v-else class="text-[11px] text-muted-foreground">
              This pair already carries body text. Nothing to fix.
            </p>
            <p v-if="detail.grade !== 'body' && !detail.repair" class="text-[11px] text-muted-foreground">
              No lightness along this hue reaches the target against that background. Change the
              background instead.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <p class="text-[11px] leading-snug text-muted-foreground">
      <span v-if="showNumbers">
        Rows are text, columns are backgrounds.
      </span>
      <span v-else>
        Rows are text, columns are backgrounds. Numbers are hidden at this size — click a cell for
        the values.
      </span>
    </p>
  </div>
</template>
