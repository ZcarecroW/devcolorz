<script setup lang="ts">
/**
 * A dual-thumb range slider that understands wrap-around.
 *
 * Built from scratch rather than on a slider primitive, because hue ranges
 * need something no standard slider does: when the lower thumb passes the
 * upper one on a cyclic channel, the selection does not collapse — it wraps
 * through zero. `340°→20°` has to mean "the reds", which is the range people
 * actually want, and no off-the-shelf component expresses it.
 *
 * Interaction model:
 *   • drag a thumb              — move that edge
 *   • drag the selected band    — translate the whole range, keeping its width
 *   • click the dimmed track    — jump the nearer thumb to that point
 *
 * Translating used to require holding Alt, which was a mistake: the band sits
 * on top of the track and covers most of it, so a plain drag inside the
 * selection hit an element whose only handler was modifier-gated and nothing
 * happened at all. The range simply refused to move. Dragging the band now
 * works unmodified, which is also what the grab cursor has been promising.
 *
 * Accessibility: a `group` containing two real `slider`s, each with its own
 * value and label, so the whole thing is operable and announced from the
 * keyboard. Shift+arrow takes larger steps. The thumbs are 16px for looks but
 * carry a 32px invisible hit area, because a 16px target fails WCAG 2.5.8 and
 * is genuinely hard to hit.
 */
import { computed, ref } from 'vue'
import type { Range } from '@/lib/color/types'

const props = withDefaults(
  defineProps<{
    modelValue: Range
    min: number
    max: number
    step?: number
    /** Hue-like channels wrap at `max`; everything else clamps. */
    cyclic?: boolean
    disabled?: boolean
    /** CSS background painted along the track, showing what the channel does. */
    gradient?: string
    /**
     * Stretches (0–1) of the channel that no combination of the other
     * channels' selected ranges can reach, drawn as a hatch.
     */
    outOfGamut?: Array<[start: number, end: number]>
    label: string
    /** Formats a raw value for the ARIA announcement and the thumb tooltip. */
    format?: (value: number) => string
  }>(),
  { step: 1, cyclic: false, disabled: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: Range]
  /** Fired once when a drag or key sequence finishes — the history boundary. */
  commit: []
}>()

const track = ref<HTMLElement | null>(null)
const activeThumb = ref<'min' | 'max' | 'band' | null>(null)

const span = computed(() => props.max - props.min || 1)
const format = computed(() => props.format ?? ((v: number) => String(Math.round(v * 100) / 100)))

/** Position of a raw value along the track, 0–1. */
function toRatio(value: number): number {
  return (value - props.min) / span.value
}

function fromRatio(ratio: number): number {
  const raw = props.min + Math.min(1, Math.max(0, ratio)) * span.value
  const stepped = Math.round(raw / props.step) * props.step
  // Floating-point steps such as 1/255 leave dust; round to the step's own
  // precision so the numeric inputs do not show 0.30000000000000004.
  const decimals = Math.min(6, (String(props.step).split('.')[1] ?? '').length)
  return Number(Math.min(props.max, Math.max(props.min, stepped)).toFixed(decimals))
}

/** True when the range wraps through the origin. */
const wrapped = computed(() => props.cyclic && props.modelValue.min > props.modelValue.max)

/** The one or two highlighted bands, as percentage geometry. */
const bands = computed(() => {
  const lo = toRatio(props.modelValue.min)
  const hi = toRatio(props.modelValue.max)
  if (!wrapped.value) {
    return [{ left: Math.min(lo, hi) * 100, width: Math.abs(hi - lo) * 100 }]
  }
  return [
    { left: lo * 100, width: (1 - lo) * 100 },
    { left: 0, width: hi * 100 },
  ]
})

const coverage = computed(() => bands.value.reduce((sum, b) => sum + b.width, 0))

function ratioFromEvent(event: PointerEvent): number {
  const element = track.value
  if (!element) return 0
  const rect = element.getBoundingClientRect()
  return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
}

let dragOrigin: { ratio: number; range: Range } | null = null

function onPointerDown(event: PointerEvent, thumb: 'min' | 'max' | 'band') {
  if (props.disabled) return
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  activeThumb.value = thumb
  dragOrigin = { ratio: ratioFromEvent(event), range: { ...props.modelValue } }
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!activeThumb.value || props.disabled) return
  const ratio = ratioFromEvent(event)

  if (activeThumb.value === 'band') {
    if (!dragOrigin) return
    const delta = (ratio - dragOrigin.ratio) * span.value
    if (props.cyclic) {
      const wrap = (v: number) => ((v - props.min) % span.value + span.value) % span.value + props.min
      emit('update:modelValue', {
        min: wrap(dragOrigin.range.min + delta),
        max: wrap(dragOrigin.range.max + delta),
      })
    } else {
      // Clamp the translation so the band keeps its width at both ends.
      const width = dragOrigin.range.max - dragOrigin.range.min
      const nextMin = Math.min(props.max - width, Math.max(props.min, dragOrigin.range.min + delta))
      emit('update:modelValue', { min: nextMin, max: nextMin + width })
    }
    return
  }

  const value = fromRatio(ratio)
  const next: Range = { ...props.modelValue, [activeThumb.value]: value }
  // On a linear channel the thumbs must not cross; on a cyclic one, crossing
  // is exactly how you express a wrapping range, so let it happen.
  if (!props.cyclic) {
    if (next.min > next.max) {
      if (activeThumb.value === 'min') next.max = next.min
      else next.min = next.max
    }
  }
  emit('update:modelValue', next)
}

function onPointerUp() {
  if (!activeThumb.value) return
  activeThumb.value = null
  dragOrigin = null
  emit('commit')
}

function onKeydown(event: KeyboardEvent, thumb: 'min' | 'max') {
  if (props.disabled) return
  const big = event.shiftKey ? 10 : 1
  const delta =
    event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? props.step * big
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -props.step * big
        : event.key === 'PageUp'
          ? span.value * 0.1
          : event.key === 'PageDown'
            ? -span.value * 0.1
            : 0
  if (delta === 0 && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()

  let value = props.modelValue[thumb] + delta
  if (event.key === 'Home') value = props.min
  if (event.key === 'End') value = props.max
  if (props.cyclic) {
    value = ((value - props.min) % span.value + span.value) % span.value + props.min
  } else {
    value = Math.min(props.max, Math.max(props.min, value))
  }
  const next: Range = { ...props.modelValue, [thumb]: fromRatio(toRatio(value)) }
  if (!props.cyclic) {
    if (next.min > next.max) {
      if (thumb === 'min') next.max = next.min
      else next.min = next.max
    }
  }
  emit('update:modelValue', next)
  emit('commit')
}

/** Click on empty track: move whichever thumb is nearer. */
function onTrackPointerDown(event: PointerEvent) {
  if (props.disabled || activeThumb.value) return
  const ratio = ratioFromEvent(event)
  const value = fromRatio(ratio)
  const distanceToMin = Math.abs(toRatio(props.modelValue.min) - ratio)
  const distanceToMax = Math.abs(toRatio(props.modelValue.max) - ratio)
  const thumb = distanceToMin <= distanceToMax ? 'min' : 'max'
  emit('update:modelValue', { ...props.modelValue, [thumb]: value })
  onPointerDown(event, thumb)
}
</script>

<template>
  <div
    class="relative h-7 w-full touch-none select-none"
    role="group"
    :aria-label="`${label} range`"
    :aria-disabled="disabled || undefined"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      ref="track"
      class="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2 cursor-pointer overflow-hidden rounded-md border border-border/60"
      :class="disabled && 'opacity-45'"
      :style="{ background: gradient ?? 'var(--muted)' }"
      @pointerdown="onTrackPointerDown"
    >
      <!-- Dim everything outside the selection rather than hiding it: seeing
           the rejected part of the channel is what makes the range legible. -->
      <div class="pointer-events-none absolute inset-0 bg-background/70 backdrop-grayscale-[0.4]" />
      <div
        v-for="(band, i) in bands"
        :key="i"
        class="pointer-events-none absolute inset-y-0"
        :style="{ left: `${band.left}%`, width: `${band.width}%`, background: gradient ?? 'var(--primary)' }"
      />
      <!-- Out-of-gamut hatching -->
      <div
        v-for="(gap, i) in outOfGamut ?? []"
        :key="`g${i}`"
        class="pointer-events-none absolute inset-y-0 opacity-70"
        :style="{
          left: `${gap[0] * 100}%`,
          width: `${(gap[1] - gap[0]) * 100}%`,
          backgroundImage:
            'repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 45%, transparent) 0 2px, transparent 2px 5px)',
        }"
        title="Outside the sRGB gamut at these values — colors here will be gamut-mapped."
      />
    </div>

    <!-- Drag surface: translates the whole band without resizing it. -->
    <div
      v-for="(band, i) in bands"
      :key="`b${i}`"
      class="absolute top-1/2 h-5 -translate-y-1/2 cursor-grab active:cursor-grabbing"
      :style="{ left: `${band.left}%`, width: `${band.width}%` }"
      @pointerdown.stop="onPointerDown($event, 'band')"
    />

    <button
      v-for="thumb in (['min', 'max'] as const)"
      :key="thumb"
      type="button"
      role="slider"
      class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-background bg-foreground shadow-sm transition-transform duration-100 before:absolute before:-inset-2 before:content-[''] hover:scale-115 focus-visible:scale-115 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      :class="activeThumb === thumb && 'scale-115'"
      :style="{ left: `${toRatio(modelValue[thumb]) * 100}%` }"
      :aria-label="`${label} ${thumb === 'min' ? 'from' : 'to'}`"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue[thumb]"
      :aria-valuetext="format(modelValue[thumb])"
      :aria-disabled="disabled || undefined"
      :disabled="disabled"
      @pointerdown="onPointerDown($event, thumb)"
      @keydown="onKeydown($event, thumb)"
    />

    <span
      v-if="wrapped"
      class="pointer-events-none absolute -top-1 right-0 rounded-sm bg-primary/15 px-1 text-[9px] font-medium text-primary"
      title="This range wraps through 0°, so it selects the arc across the origin rather than everything else."
    >
      wraps
    </span>
    <span class="sr-only">{{ Math.round(coverage) }}% of the channel selected</span>
  </div>
</template>
