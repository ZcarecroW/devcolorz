<script setup lang="ts">
/**
 * Eleven tonal steps for every color in the palette — the second QA surface.
 *
 * Two decisions worth knowing. First, the steps are built with CSS
 * `color-mix(in oklab, …)` toward white and black rather than by calling the
 * scale engine: a template must not do color math, and mixing in OKLab is
 * close enough to show where a hue turns muddy. The Scales panel remains the
 * place to tune a real ramp. Second, the step numbers sit in a header row
 * instead of inside each swatch, because a label printed on an unknown color
 * would need a contrast decision this component is not allowed to make.
 */
import { computed } from 'vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/** How much of the base color survives at each step. 500 is the color itself. */
const SURVIVES: Record<number, number> = {
  50: 6,
  100: 12,
  200: 24,
  300: 42,
  400: 68,
  500: 100,
  600: 86,
  700: 70,
  800: 55,
  900: 42,
  950: 32,
}

/** Ramp variables are ordered light → dark and always cover the whole palette. */
const rampCount = computed(() => Math.max(1, props.roles.ramp.length))

const columns = { gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }

function stepColor(index: number, step: number): string {
  const base = `var(--p-ramp-${index})`
  if (step === 500) return base
  return `color-mix(in oklab, ${base} ${SURVIVES[step]}%, ${step < 500 ? 'white' : 'black'})`
}
</script>

<template>
  <div
    class="@container flex min-h-full flex-col gap-2.5 p-3"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <h2 class="text-[13px] font-semibold tracking-tight">Tonal ramps</h2>
      <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">
        {{ rampCount }} {{ rampCount === 1 ? 'color' : 'colors' }}, 11 steps each
      </span>
    </div>

    <!-- Step scale, aligned to the strips below -->
    <div class="flex items-center gap-1">
      <span class="w-5 shrink-0" />
      <div class="grid flex-1 gap-px" :style="columns">
        <span
          v-for="step in STEPS"
          :key="step"
          class="text-center text-[7px] tabular-nums @2xl:text-[9px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          {{ step }}
        </span>
      </div>
      <span
        class="w-7 shrink-0 text-center text-[7px] @2xl:text-[9px]"
        :style="{ color: 'var(--p-text-muted)' }"
      >
        pair
      </span>
    </div>

    <div class="flex flex-col gap-1">
      <div v-for="index in rampCount" :key="index" class="flex items-center gap-1">
        <span
          class="w-5 shrink-0 text-[8px] tabular-nums"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          {{ String(index).padStart(2, '0') }}
        </span>
        <div
          class="grid flex-1 gap-px overflow-hidden rounded-[3px]"
          role="img"
          :aria-label="`Tonal ramp for palette color ${index}`"
          :style="columns"
        >
          <span
            v-for="step in STEPS"
            :key="step"
            class="h-4 @2xl:h-5"
            :style="{ background: stepColor(index, step) }"
          />
        </div>
        <!-- The pair a designer actually ships: 800 text on a 100 surface. -->
        <span
          class="flex w-7 shrink-0 items-center justify-center rounded-[3px] py-0.5 text-[8px] font-semibold @2xl:text-[9px]"
          :style="{ background: stepColor(index, 100), color: stepColor(index, 800) }"
        >
          Aa
        </span>
      </div>
    </div>

    <p class="mt-auto text-[9px] leading-snug" :style="{ color: 'var(--p-text-muted)' }">
      Steps are mixed toward white and black in OKLab. A ramp that loses its hue
      between 700 and 950 needs chroma held on the dark end, which the Scales
      panel can do.
    </p>
  </div>
</template>
