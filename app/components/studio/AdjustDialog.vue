<script setup lang="ts">
/**
 * The per-color editor: one swatch, every way of looking at it.
 *
 * The decision worth knowing: the channel sliders do not read the store, they
 * read a local `draft` of the color's channel values in the chosen space, and
 * push each change through `previewColor`. Converting the stored OKLCH back
 * into HSL or HWB on every frame would fight the user — a grey has no hue to
 * recover, a clipped chroma comes back smaller than it went in — so the draft
 * is authoritative while a gesture is running and only resynchronises from the
 * store when the user is not touching anything.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Check, Copy, Lock, LockOpen, RotateCcw, Trash2, TriangleAlert, Wand2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import InfoHint from '@/components/common/InfoHint.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FORMAT_HINTS,
  FORMAT_LABELS,
  channelValues,
  formatColor,
  fromChannelValues,
  parseColor,
} from '@/lib/color/convert'
import {
  METRIC_HINTS,
  apca,
  apcaVerdict,
  bestBlackOrWhite,
  makeReadable,
  wcag,
  wcagLevel,
} from '@/lib/color/contrast'
import { isInGamut, mapToGamut, maxChroma } from '@/lib/color/gamut'
import { channelGradient } from '@/lib/color/gradient'
import { describeColor, nearestName } from '@/lib/color/name'
import { SPACES, SPACE_IDS, getSpace } from '@/lib/color/spaces'
import { usePaletteStore } from '@/stores/palette'
import { useStudioStore } from '@/stores/studio'
import type { ChannelDef, ColorFormat, Oklch, SpaceId } from '@/lib/color/types'

const props = defineProps<{
  /** The swatch being edited. Non-null opens the dialog. */
  swatchId: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const palette = usePaletteStore()
const studio = useStudioStore()

const FORMATS = Object.keys(FORMAT_LABELS) as ColorFormat[]
const WHITE: Oklch = { mode: 'oklch', l: 1, c: 0, h: 0 }
const BLACK: Oklch = { mode: 'oklch', l: 0, c: 0, h: 0 }
/** Stands in for one tick after a delete, so no computed has to be nullable. */
const NEUTRAL: Oklch = { mode: 'oklch', l: 0.5, c: 0, h: 0 }

/** Checkerboard behind translucent colors, so alpha is visible, not implied. */
const CHECKER = 'repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%) 0 0 / 14px 14px'

/* ---------------- the swatch ---------------- */

const isOpen = computed(() => props.swatchId !== null)
const swatch = computed(() => palette.swatches.find((s) => s.id === props.swatchId) ?? null)
const active = computed<Oklch>(() => swatch.value?.color ?? NEUTRAL)
const alpha = computed(() => active.value.alpha ?? 1)

const curatedName = ref('')
const structural = computed(() => describeColor(active.value))
const displayName = computed(() => swatch.value?.name || curatedName.value || structural.value)
const surface = computed(() => formatColor(active.value, 'oklch'))
const ink = computed(() => formatColor(bestBlackOrWhite(active.value), 'oklch'))
const hex = computed(() => formatColor(active.value, 'hex'))

/** Identity of the color as displayed, used to drive every resync. */
const colorKey = computed(() => {
  const c = active.value
  return `${props.swatchId}|${space.value}|${c.l}|${c.c}|${c.h}|${c.alpha ?? 1}`
})

/* ---------------- editing state ---------------- */

const space = ref<SpaceId>('oklch')
const currentSpace = computed(() => getSpace(space.value))
const channels = computed(() => currentSpace.value.channels)

const draft = ref<Record<string, number>>({})
const original = shallowRef<Oklch | null>(null)

/** True from pointer-down until the gesture ends; freezes the resync. */
const editing = ref(false)
let gestureCommitted = false

function syncDraft() {
  draft.value = channelValues(active.value, space.value)
}

function startGesture() {
  editing.value = true
  gestureCommitted = false
}

/**
 * History boundary for a drag.
 *
 * Recorded on the first actual change rather than on pointer-down itself: the
 * undo step still covers the whole gesture, and a click that moves nothing
 * does not leave a no-op entry behind.
 */
function beginChange() {
  if (gestureCommitted) return
  palette.commit('Adjust color')
  gestureCommitted = true
}

function endGesture() {
  editing.value = false
  gestureCommitted = false
}

function applyChannel(key: string, value: number) {
  const target = swatch.value
  if (!target) return
  beginChange()
  const next = { ...draft.value, [key]: value }
  draft.value = next
  palette.previewColor(target.id, fromChannelValues(space.value, next, alpha.value))
}

function clampChannel(channel: ChannelDef, value: number): number {
  if (channel.cyclic) return ((value % channel.max) + channel.max) % channel.max
  return Math.min(channel.max, Math.max(channel.min, value))
}

function displayValue(channel: ChannelDef): string {
  const raw = draft.value[channel.key] ?? 0
  return `${(raw * channel.displayScale).toFixed(channel.precision)}${channel.unit}`
}

function applyChannelText(channel: ChannelDef, raw: string) {
  const parsed = Number.parseFloat(raw.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(parsed)) {
    syncDraft()
    return
  }
  startGesture()
  applyChannel(channel.key, clampChannel(channel, parsed / channel.displayScale))
  endGesture()
}

function applyAlpha(value: number) {
  const target = swatch.value
  if (!target) return
  beginChange()
  palette.previewColor(target.id, { ...active.value, alpha: value })
}

/* ---------------- gradients ---------------- */

/**
 * The channel values the tracks are painted from.
 *
 * Held one step behind the draft: repainting three 24-stop gradients on every
 * pointer move is real work, and a track that lags the thumb by a frame or two
 * is invisible where a dropped frame is not.
 */
const basis = shallowRef<{ space: SpaceId; values: Record<string, number> }>({
  space: 'oklch',
  values: {},
})

function refreshBasis() {
  basis.value = { space: space.value, values: draft.value }
}

const gradients = computed(() => {
  const out: Record<string, string> = {}
  for (const channel of getSpace(basis.value.space).channels) {
    out[channel.key] = channelGradient(basis.value.space, channel.key, basis.value.values)
  }
  return out
})

const alphaTrack = computed(() => {
  const opaque = formatColor({ ...active.value, alpha: 1 }, 'oklch')
  return `linear-gradient(to right, transparent, ${opaque}), ${CHECKER}`
})

/* ---------------- gamut ---------------- */

const inGamut = computed(() => isInGamut(active.value))
const ceiling = computed(() => maxChroma(active.value.l ?? 0, active.value.h ?? 0))
const chromaUse = computed(() => {
  const c = active.value.c ?? 0
  return ceiling.value > 0 ? c / ceiling.value : 0
})

function mapIntoGamut() {
  const target = swatch.value
  if (!target) return
  palette.setColor(target.id, mapToGamut(active.value, 'css4'), 'Map into sRGB')
}

/* ---------------- notations ---------------- */

const notations = computed(() =>
  FORMATS.map((id) => ({
    id,
    label: FORMAT_LABELS[id],
    hint: FORMAT_HINTS[id],
    value: formatColor(active.value, id),
  })),
)

const copiedId = ref<string | null>(null)

async function copy(id: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 1200)
  } catch {
    toast.error('Could not reach the clipboard', {
      description: 'Your browser blocked it. Select the value and copy manually.',
    })
  }
}

/* ---------------- free-text entry ---------------- */

const textDraft = ref('')
const textInvalid = ref(false)
const textFocused = ref(false)

function resyncText() {
  textDraft.value = formatColor(active.value, studio.format)
  textInvalid.value = false
}

function applyText() {
  const target = swatch.value
  const parsed = parseColor(textDraft.value)
  if (!parsed || !target) {
    textInvalid.value = true
    return
  }
  textInvalid.value = false
  palette.setColor(target.id, parsed, 'Set color value')
}

function onTextBlur() {
  textFocused.value = false
  if (parseColor(textDraft.value)) applyText()
  else resyncText()
}

/* ---------------- contrast ---------------- */

const contrastRows = computed(() => {
  const base = active.value
  const targets = [
    { key: 'white', label: 'White', color: WHITE },
    { key: 'black', label: 'Black', color: BLACK },
    ...palette.swatches
      .filter((s) => s.id !== props.swatchId)
      .map((s) => ({ key: s.id, label: palette.labelFor(s), color: s.color })),
  ]
  return targets.map((target) => {
    const ratio = wcag(base, target.color)
    const lc = apca(base, target.color)
    return {
      ...target,
      css: formatColor(target.color, 'oklch'),
      ratio,
      level: wcagLevel(ratio),
      lc,
      verdict: apcaVerdict(lc),
    }
  })
})

function makeRowReadable(row: { label: string; color: Oklch }) {
  const target = swatch.value
  if (!target) return
  const next = makeReadable(active.value, row.color, { metric: studio.metric })
  if (!next) {
    toast.error(`Cannot reach the target against ${row.label}`, {
      description: 'Lightness runs out in both directions before the pair passes. Change the other color instead.',
    })
    return
  }
  palette.setColor(target.id, next, `Readable on ${row.label}`)
}

/* ---------------- actions ---------------- */

const changed = computed(() => {
  const from = original.value
  if (!from) return false
  const to = active.value
  return (
    from.l !== to.l ||
    from.c !== to.c ||
    from.h !== to.h ||
    (from.alpha ?? 1) !== (to.alpha ?? 1)
  )
})

function reset() {
  const target = swatch.value
  const from = original.value
  if (!target || !from) return
  palette.setColor(target.id, { ...from }, 'Reset color')
}

function remove() {
  const target = swatch.value
  if (!target) return
  palette.removeSwatch(target.id)
  emit('close')
}

function onOpenChange(value: boolean) {
  if (!value) emit('close')
}

/* ---------------- wiring ---------------- */

// Order matters: the draft resync must run before anything that reads it.
watch(
  () => props.swatchId,
  (id) => {
    endGesture()
    const found = id ? palette.swatches.find((s) => s.id === id) : null
    original.value = found ? { ...found.color } : null
    curatedName.value = ''
    copiedId.value = null
    void fetchName()
  },
  { immediate: true },
)

watch(
  colorKey,
  () => {
    if (!editing.value) syncDraft()
  },
  { immediate: true },
)

watch([colorKey, () => studio.format], () => {
  if (!textFocused.value) resyncText()
}, { immediate: true })

// A space change repaints immediately; a value change repaints once the drag
// settles, with a ceiling so a long drag still refreshes on the way.
watch(space, refreshBasis, { immediate: true })
watchDebounced(colorKey, refreshBasis, { debounce: 60, maxWait: 220 })

/**
 * The curated name list is a lazily loaded chunk and a linear scan over
 * thousands of entries, so it is only consulted once the color settles.
 */
async function fetchName() {
  const token = props.swatchId
  if (!token) return
  try {
    const result = await nearestName(active.value)
    if (props.swatchId === token) curatedName.value = result.name
  } catch {
    // No name index means the structural description stands in. Not fatal.
  }
}

watchDebounced(colorKey, () => void fetchName(), { debounce: 220 })
</script>

<template>
  <Dialog :open="isOpen" @update:open="onOpenChange">
    <DialogScrollContent class="sm:max-w-3xl">
      <DialogHeader class="pr-8">
        <DialogTitle class="flex flex-wrap items-center gap-2">
          Adjust color
          <span class="font-mono text-sm font-normal text-muted-foreground tabular-nums">{{ hex }}</span>
        </DialogTitle>
        <DialogDescription>
          One color in full: every notation, its channels in any space, how much chroma the gamut
          still has left, and how it reads against the rest of the palette.
        </DialogDescription>
      </DialogHeader>

      <div v-if="swatch" class="grid gap-5 lg:grid-cols-2">
        <!-- Left: identity, notations, free-text entry -->
        <div class="flex min-w-0 flex-col gap-4">
          <div class="overflow-hidden rounded-xl border" :style="{ background: CHECKER }">
            <div
              class="flex min-h-32 flex-col justify-end gap-0.5 p-4"
              :style="{ background: surface, color: ink }"
            >
              <span class="truncate text-base font-semibold">{{ displayName }}</span>
              <span class="truncate text-xs opacity-75">
                {{ structural }} · {{ hex }}<template v-if="alpha < 1"> · {{ Math.round(alpha * 100) }}% alpha</template>
              </span>
            </div>
          </div>

          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex items-center gap-2">
              <Label class="text-xs">Notations</Label>
              <InfoHint
                title="Every notation"
                wide
                text="The same color written every way this app can export it. Click a line to copy it. Hex and rgb() clip anything outside sRGB, so a wide-gamut color reads differently there than in oklch() — which is why both are shown rather than one."
              />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)] gap-0.5">
              <button
                v-for="item in notations"
                :key="item.id"
                type="button"
                class="group/copy flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-left transition-colors hover:border-border hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                :title="item.hint"
                :aria-label="`Copy ${item.label}: ${item.value}`"
                @click="copy(item.id, item.value)"
              >
                <span class="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
                  {{ item.label }}
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums">
                  {{ item.value }}
                </span>
                <Check v-if="copiedId === item.id" class="size-3 shrink-0 text-primary" />
                <Copy
                  v-else
                  class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/copy:opacity-100"
                />
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2">
              <Label for="adjust-value" class="text-xs">Value</Label>
              <InfoHint
                title="Paste any notation"
                wide
                text="Accepts hex with or without the hash, rgb(), hsl(), lab(), lch(), oklab(), oklch(), color() and CSS named colors. Whatever you paste is converted to OKLCH on the way in, so a color taken from anywhere keeps its identity here. Press Enter to apply."
              />
            </div>
            <input
              id="adjust-value"
              v-model="textDraft"
              class="w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              :class="textInvalid && 'border-destructive'"
              :aria-invalid="textInvalid || undefined"
              :aria-describedby="textInvalid ? 'adjust-value-error' : undefined"
              spellcheck="false"
              autocomplete="off"
              placeholder="#3b82f6, oklch(62% 0.21 259), rebeccapurple…"
              @focus="textFocused = true"
              @blur="onTextBlur"
              @keydown.enter.prevent="applyText"
            />
            <!--
              `role=alert` and an id: pressing Enter on an unparseable value
              changed nothing on screen except this line, which was announced
              to nobody and pointed at by nothing.
            -->
            <p v-if="textInvalid" id="adjust-value-error" role="alert" class="text-[11px] text-destructive">
              Not a color this parser recognises. Check the syntax and try again.
            </p>
          </div>
        </div>

        <!-- Right: channels, alpha, gamut headroom -->
        <div class="flex min-w-0 flex-col gap-4">
          <div class="flex items-center gap-2">
            <Label class="w-14 shrink-0 text-xs">Space</Label>
            <Select
              :model-value="space"
              @update:model-value="space = $event as SpaceId"
            >
              <SelectTrigger size="sm" class="flex-1" aria-label="Editing color space">
                <SelectValue />
              </SelectTrigger>
              <SelectContent class="max-h-96">
                <SelectItem
                  v-for="id in SPACE_IDS"
                  :key="id"
                  :value="id"
                  :label="SPACES[id].label"
                  :description="SPACES[id].description"
                >
                  <template #badge>
                    <span
                      v-if="SPACES[id].perceptual"
                      class="rounded-sm bg-primary/15 px-1 text-[9px] text-primary"
                    >
                      perceptual
                    </span>
                  </template>
                </SelectItem>
              </SelectContent>
            </Select>
            <InfoHint title="Editing space" wide :text="currentSpace.description" />
          </div>

          <div class="flex flex-col gap-3">
            <div v-for="channel in channels" :key="channel.key" class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-semibold">{{ channel.label }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ channel.name }}</span>
                <InfoHint :title="channel.name" :text="channel.hint" wide />
                <span class="flex-1" />
                <input
                  class="w-20 rounded-md border bg-background px-1.5 py-1 text-right font-mono text-[11px] tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  :value="displayValue(channel)"
                  :aria-label="`${channel.name} value`"
                  inputmode="decimal"
                  spellcheck="false"
                  @change="applyChannelText(channel, ($event.target as HTMLInputElement).value)"
                  @keydown.enter.prevent="applyChannelText(channel, ($event.target as HTMLInputElement).value)"
                />
              </div>

              <div
                class="relative h-6 rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <!-- Inset by half a thumb so the thumb's centre lands on the
                     value it selects; a full-bleed track lies at both ends. -->
                <div
                  class="pointer-events-none absolute inset-x-2 top-1/2 h-4 -translate-y-1/2 rounded-md border border-border/60"
                  :style="{ background: gradients[channel.key] ?? 'var(--muted)' }"
                />
                <input
                  type="range"
                  class="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm"
                  :min="channel.min"
                  :max="channel.max"
                  :step="channel.step"
                  :value="draft[channel.key] ?? 0"
                  :aria-label="channel.name"
                  :aria-valuetext="displayValue(channel)"
                  @pointerdown="startGesture"
                  @keydown="startGesture"
                  @input="applyChannel(channel.key, Number(($event.target as HTMLInputElement).value))"
                  @change="endGesture"
                  @blur="endGesture"
                />
              </div>
            </div>

            <!-- Alpha -->
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-semibold">A</span>
                <span class="text-xs text-muted-foreground">Alpha</span>
                <InfoHint
                  title="Alpha"
                  wide
                  text="Transparency carried by the color itself. Only hex + alpha and the modern function notations can express it; plain hex and the legacy syntaxes drop it without warning. The contrast figures below ignore alpha, because what a translucent color measures depends entirely on what sits behind it."
                />
                <span class="flex-1" />
                <span class="w-20 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {{ (alpha * 100).toFixed(0) }}%
                </span>
              </div>
              <div class="relative h-6 rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <div
                  class="pointer-events-none absolute inset-x-2 top-1/2 h-4 -translate-y-1/2 rounded-md border border-border/60"
                  :style="{ background: alphaTrack }"
                />
                <input
                  type="range"
                  class="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 cursor-pointer appearance-none bg-transparent outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-sm"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="alpha"
                  aria-label="Alpha"
                  :aria-valuetext="`${(alpha * 100).toFixed(0)} percent`"
                  @pointerdown="startGesture"
                  @keydown="startGesture"
                  @input="applyAlpha(Number(($event.target as HTMLInputElement).value))"
                  @change="endGesture"
                  @blur="endGesture"
                />
              </div>
            </div>
          </div>

          <!-- Gamut headroom -->
          <div class="rounded-lg border bg-card/40 p-2.5 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-medium">Chroma ceiling</span>
              <InfoHint
                title="Chroma ceiling"
                wide
                text="The most chroma sRGB can show at this exact lightness and hue. Every hue has a different ceiling and it collapses toward black and white, which is why a vivid yellow survives being lightened and a vivid blue does not. Going past the ceiling is allowed — the value is kept — but hex and rgb() exports will pull it back."
              />
              <span class="flex-1" />
              <span class="font-mono text-muted-foreground tabular-nums">
                {{ ceiling.toFixed(3) }}
              </span>
            </div>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-[width] duration-150"
                :class="chromaUse > 1 ? 'bg-destructive' : 'bg-primary'"
                :style="{ width: `${Math.min(100, chromaUse * 100)}%` }"
              />
            </div>
            <p class="mt-2 leading-relaxed text-muted-foreground">
              At L {{ ((active.l ?? 0) * 100).toFixed(1) }}% and H {{ (active.h ?? 0).toFixed(0) }}°,
              sRGB holds {{ ceiling.toFixed(3) }} chroma. This color uses
              {{ (chromaUse * 100).toFixed(0) }}% of it.
            </p>

            <div
              v-if="!inGamut"
              class="mt-2 flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/10 p-2"
            >
              <TriangleAlert class="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <p class="min-w-0 flex-1 leading-relaxed">
                Outside sRGB. Most screens and every hex or rgb() export will pull this back, so the
                color you see here is not the color that ships.
              </p>
              <Button
                size="xs"
                variant="outline"
                title="Apply the CSS Color 4 mapping: chroma comes down, hue and lightness stay."
                @click="mapIntoGamut"
              >
                <Wand2 /> Map in
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Contrast -->
      <div v-if="swatch" class="flex min-w-0 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Label class="shrink-0 text-xs">Contrast</Label>
          <InfoHint :title="studio.metric === 'apca' ? 'APCA' : 'WCAG 2'" wide :text="METRIC_HINTS[studio.metric]" />
          <span class="min-w-0 flex-1 text-[11px] text-muted-foreground">
            this color as text on each background
          </span>
          <InfoHint
            title="Make readable"
            wide
            text="Moves this color's lightness up or down — whichever needs the smaller move — until the pair clears the target for the metric you have selected, holding hue and clamping chroma to whatever the new lightness can carry. It changes this color, never the one you are comparing against. If neither direction reaches the target, nothing is applied."
          />
        </div>

        <div class="scroll-slim min-w-0 max-w-full overflow-x-auto">
          <table class="w-full text-xs">
            <caption class="sr-only">
              Contrast of this color against white, black and every other color in the palette
            </caption>
            <thead class="text-muted-foreground">
              <tr>
                <th scope="col" class="px-2 py-1 text-left font-medium">Background</th>
                <th scope="col" class="px-2 py-1 text-right font-medium">
                  <span class="inline-flex items-center gap-1">
                    WCAG
                    <Badge v-if="studio.metric === 'wcag'" variant="secondary" class="px-1 py-0 text-[9px]">
                      in use
                    </Badge>
                  </span>
                </th>
                <th scope="col" class="px-2 py-1 text-left font-medium">Level</th>
                <th scope="col" class="px-2 py-1 text-right font-medium">
                  <span class="inline-flex items-center gap-1">
                    APCA
                    <Badge v-if="studio.metric === 'apca'" variant="secondary" class="px-1 py-0 text-[9px]">
                      in use
                    </Badge>
                  </span>
                </th>
                <th scope="col" class="px-2 py-1 text-left font-medium">Reads as</th>
                <th scope="col" class="px-2 py-1 text-right font-medium">
                  <span class="sr-only">Fix</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in contrastRows" :key="row.key" class="border-t border-border/60">
                <th scope="row" class="max-w-[12rem] px-2 py-1.5 text-left font-normal">
                  <span class="flex min-w-0 items-center gap-2">
                    <span
                      class="size-3 shrink-0 rounded-sm border border-border/60"
                      :style="{ background: row.css }"
                    />
                    <span class="truncate">{{ row.label }}</span>
                  </span>
                </th>
                <td class="px-2 py-1.5 text-right font-mono tabular-nums">
                  {{ row.ratio.toFixed(2) }}:1
                </td>
                <td class="px-2 py-1.5">
                  <Badge
                    :variant="row.level === 'Fail' ? 'destructive' : 'secondary'"
                    class="px-1.5 py-0 text-[10px]"
                  >
                    {{ row.level }}
                  </Badge>
                </td>
                <td class="px-2 py-1.5 text-right font-mono tabular-nums">
                  {{ Math.round(row.lc) }}
                </td>
                <td class="px-2 py-1.5">
                  <!--
                    `truncate` needs a block box and a width to work against:
                    on an inline span it does nothing, and a max-width on the
                    cell is ignored under automatic table layout, so this prose
                    pushed the table wider than the dialog.
                  -->
                  <span
                    class="block max-w-[14rem] truncate"
                    :class="row.verdict.ok ? 'text-muted-foreground' : 'text-destructive'"
                    :title="row.verdict.use"
                  >
                    {{ row.verdict.use }}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-right">
                  <Button
                    size="xs"
                    variant="ghost"
                    :title="`Shift this color's lightness until it is readable on ${row.label}.`"
                    @click="makeRowReadable(row)"
                  >
                    Make readable
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter v-if="swatch" class="gap-2 sm:justify-between">
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="!changed"
            title="Put back the value this dialog opened with."
            @click="reset"
          >
            <RotateCcw /> Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            :aria-pressed="swatch.locked"
            :title="swatch.locked ? 'Unlock — this color will change on the next roll.' : 'Lock — keep this color when generating.'"
            @click="palette.toggleLock(swatch.id)"
          >
            <Lock v-if="swatch.locked" />
            <LockOpen v-else />
            {{ swatch.locked ? 'Unlock' : 'Lock' }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive hover:text-destructive"
            :disabled="palette.count <= 1"
            title="Remove this color from the palette."
            @click="remove"
          >
            <Trash2 /> Delete
          </Button>
        </div>
        <Button size="sm" @click="emit('close')">Done</Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
