<script setup lang="ts">
/**
 * One channel in the range panel: lock, numeric bounds, dual-thumb track and
 * a distribution picker.
 */
import { computed } from 'vue'
import { refDebounced } from '@vueuse/core'
import { Lock, LockOpen } from '@lucide/vue'
import RangeSlider from '@/components/generator/RangeSlider.vue'
import InfoHint from '@/components/common/InfoHint.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { channelGradient, gamutGaps, rangeMidpoint } from '@/lib/color/gradient'
import { DISTRIBUTION_HINTS, DISTRIBUTION_LABELS } from '@/lib/color/random'
import type { ChannelConstraint, ChannelDef, Distribution, Range, SpaceId } from '@/lib/color/types'

const props = defineProps<{
  space: SpaceId
  channel: ChannelDef
  constraint: ChannelConstraint
  /** Midpoints of the other channels, used to paint this track. */
  others: Record<string, number>
  /** Selected ranges of every channel, used to work out what is reachable. */
  ranges: Record<string, Range>
  /** Channels the user has pinned to a single value. */
  fixed: Record<string, number>
}>()

const emit = defineEmits<{
  update: [value: ChannelConstraint]
  commit: []
}>()

/*
 * Both the gradient and the gamut hatch are expensive — 24 and ~1200 colour
 * conversions respectively — and both depend on values that change on every
 * pointermove. Recomputing them per frame is what made the track visibly
 * flicker while dragging. Reading a debounced copy means the paint settles a
 * beat after the drag instead of fighting it.
 */
const paintInput = computed(() => ({
  space: props.space,
  key: props.channel.key,
  others: props.others,
  ranges: props.ranges,
  fixed: props.fixed,
}))
const settled = refDebounced(paintInput, 90)

const gradient = computed(() => channelGradient(settled.value.space, settled.value.key, settled.value.others))

const gaps = computed(() =>
  gamutGaps(settled.value.space, settled.value.key, settled.value.ranges, settled.value.fixed),
)

/** Human-facing value, scaled and rounded per the channel definition. */
function display(value: number): string {
  const scaled = value * props.channel.displayScale
  return `${scaled.toFixed(props.channel.precision)}${props.channel.unit}`
}

function fromDisplay(raw: string): number {
  const parsed = Number.parseFloat(raw.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(parsed)) return props.constraint.range.min
  const value = parsed / props.channel.displayScale
  return props.channel.cyclic
    ? ((value % props.channel.max) + props.channel.max) % props.channel.max
    : Math.min(props.channel.max, Math.max(props.channel.min, value))
}

const width = computed(() => {
  const { min, max } = props.constraint.range
  const span = props.channel.cyclic && min > max
    ? props.channel.max - min + max
    : max - min
  return Math.round((span / (props.channel.max - props.channel.min)) * 100)
})

function patch(changes: Partial<ChannelConstraint>) {
  emit('update', { ...props.constraint, ...changes })
}

function toggleLock() {
  const locked = !props.constraint.locked
  patch({
    locked,
    // Locking freezes at the middle of whatever the user had selected, which
    // is nearly always what they meant by "hold this channel steady".
    value: locked
      ? rangeMidpoint(
          props.constraint.range.min,
          props.constraint.range.max,
          props.channel.cyclic,
          props.channel.max,
        )
      : props.constraint.value,
  })
  emit('commit')
}
</script>

<template>
  <div class="rounded-lg border bg-card/40 p-2.5" :class="constraint.locked && 'border-primary/40'">
    <div class="mb-1.5 flex items-center gap-2">
      <button
        type="button"
        class="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
        :class="
          constraint.locked
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        "
        :aria-pressed="constraint.locked"
        :aria-label="constraint.locked ? `Unlock ${channel.name}` : `Lock ${channel.name}`"
        :title="
          constraint.locked
            ? `${channel.name} is fixed — every generated color shares this value.`
            : `Lock ${channel.name} to one value instead of a range.`
        "
        @click="toggleLock"
      >
        <Lock v-if="constraint.locked" class="size-3.5" />
        <LockOpen v-else class="size-3.5" />
      </button>

      <span class="shrink-0 font-mono text-xs font-semibold">{{ channel.label }}</span>
      <span class="min-w-0 truncate text-xs text-muted-foreground">{{ channel.name }}</span>
      <InfoHint :title="channel.name" :text="channel.hint" wide />

      <span class="flex-1" />

      <span
        v-if="!constraint.locked"
        class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums"
        :title="`This range covers ${width}% of the channel.`"
      >
        {{ width }}%
      </span>
    </div>

    <template v-if="constraint.locked">
      <div class="flex items-center gap-2">
        <input
          type="range"
          class="h-5 flex-1 accent-primary"
          :min="channel.min"
          :max="channel.max"
          :step="channel.step"
          :value="constraint.value"
          :aria-label="`${channel.name} value`"
          @input="patch({ value: Number(($event.target as HTMLInputElement).value) })"
          @change="emit('commit')"
        />
        <input
          class="w-20 rounded-md border bg-background px-1.5 py-1 text-right font-mono text-xs tabular-nums"
          :value="display(constraint.value)"
          :aria-label="`${channel.name} value`"
          @change="
            patch({ value: fromDisplay(($event.target as HTMLInputElement).value) });
            emit('commit')
          "
        />
      </div>
    </template>

    <template v-else>
      <RangeSlider
        :model-value="constraint.range"
        :min="channel.min"
        :max="channel.max"
        :step="channel.step"
        :cyclic="channel.cyclic"
        :gradient="gradient"
        :out-of-gamut="gaps"
        :label="channel.name"
        :format="display"
        @update:model-value="patch({ range: $event })"
        @commit="emit('commit')"
      />

      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          class="w-[4.5rem] min-w-0 rounded-md border bg-background px-1.5 py-1 text-center font-mono text-[11px] tabular-nums"
          :value="display(constraint.range.min)"
          :aria-label="`${channel.name} from`"
          @change="
            patch({ range: { ...constraint.range, min: fromDisplay(($event.target as HTMLInputElement).value) } });
            emit('commit')
          "
        />
        <span class="shrink-0 text-xs text-muted-foreground">to</span>
        <input
          class="w-[4.5rem] min-w-0 rounded-md border bg-background px-1.5 py-1 text-center font-mono text-[11px] tabular-nums"
          :value="display(constraint.range.max)"
          :aria-label="`${channel.name} to`"
          @change="
            patch({ range: { ...constraint.range, max: fromDisplay(($event.target as HTMLInputElement).value) } });
            emit('commit')
          "
        />

        <span class="flex-1" />

        <Select
          :model-value="constraint.distribution"
          @update:model-value="
            patch({ distribution: $event as Distribution });
            emit('commit')
          "
        >
          <SelectTrigger size="sm" class="h-7 w-[8.5rem] min-w-0 shrink text-[11px]" :aria-label="`${channel.name} distribution`">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(label, id) in DISTRIBUTION_LABELS"
              :key="id"
              :value="id"
              :label="label"
              :description="DISTRIBUTION_HINTS[id]"
            />
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="constraint.distribution === 'gaussian' || constraint.distribution === 'edges'"
        class="mt-1.5 flex items-center gap-2"
      >
        <span class="w-14 shrink-0 text-[11px] text-muted-foreground">Spread</span>
        <input
          type="range"
          class="h-4 min-w-0 flex-1 accent-primary"
          min="0.2"
          max="3"
          step="0.05"
          :value="constraint.spread"
          :aria-label="`${channel.name} distribution spread`"
          @input="patch({ spread: Number(($event.target as HTMLInputElement).value) })"
          @change="emit('commit')"
        />
        <span class="w-8 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
          {{ constraint.spread.toFixed(2) }}
        </span>
      </div>
    </template>
  </div>
</template>
