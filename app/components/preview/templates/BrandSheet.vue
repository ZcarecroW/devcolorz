<script setup lang="ts">
/**
 * An identity sheet: card front and back, a letterhead corner, the wordmark
 * lockup and a swatch legend.
 *
 * Everything is painted from `var(--p-*)` like every other template. The one
 * exception is the legend text: hex values are labels, not paint, so they come
 * from `formatColor` — the serializer the conventions reserve for exactly this
 * boundary. The swatch beside each label is still filled from the matching
 * ramp variable, so the chip and its number can never drift apart.
 */
import { computed } from 'vue'
import { Globe, Mail, MapPin, Phone } from '@lucide/vue'
import { formatColor } from '@/lib/color/convert'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

/** Twelve chips is the most that stays readable; a 40-color palette says so. */
const LEGEND_LIMIT = 12

const legend = computed(() =>
  props.roles.ramp.slice(0, LEGEND_LIMIT).map((entry, index) => ({
    fill: `var(--p-ramp-${index + 1})`,
    hex: formatColor(entry.color, 'hex').toUpperCase(),
  })),
)

const overflow = computed(() => Math.max(0, props.roles.ramp.length - LEGEND_LIMIT))

const CONTACT = [
  { icon: Mail, value: 'ines@aurelia.studio' },
  { icon: Phone, value: '+1 555 0142' },
  { icon: Globe, value: 'aurelia.studio' },
  { icon: MapPin, value: 'Portland, Oregon' },
]

const tint = (role: string, amount: number) =>
  `color-mix(in oklab, var(${role}) ${amount}%, var(--p-background))`
</script>

<template>
  <div
    class="@container flex min-h-full flex-col gap-3 p-3.5"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
      <h2 class="text-[13px] font-semibold tracking-tight">Aurelia — identity sheet</h2>
      <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">
        Card, letterhead, lockup
      </span>
    </div>

    <div class="grid gap-2.5 @2xl:grid-cols-2">
      <!-- Card front -->
      <div
        class="relative flex aspect-[1.72] flex-col justify-between overflow-hidden rounded-md p-3 shadow-sm"
        :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
      >
        <span
          class="absolute -top-8 -right-6 block size-24 rounded-full"
          :style="{ background: 'var(--p-accent)', opacity: 0.4 }"
        />
        <span
          class="absolute -right-2 -bottom-10 block size-20 rounded-full border"
          :style="{ borderColor: 'var(--p-text-on-primary)', opacity: 0.25 }"
        />
        <div class="relative flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" class="size-4" role="img" aria-label="Aurelia mark">
            <rect x="1" y="1" width="14" height="14" rx="4" fill="currentColor" />
            <circle cx="16" cy="16" r="7" fill="var(--p-accent)" />
          </svg>
          <span class="text-[13px] font-semibold tracking-tight">Aurelia</span>
        </div>
        <div class="relative">
          <p class="text-[11px] font-medium">Inés Marchetti</p>
          <p class="text-[9px] opacity-80">Principal, brand systems</p>
        </div>
      </div>

      <!-- Card back -->
      <div
        class="flex aspect-[1.72] flex-col justify-between rounded-md border p-3"
        :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
      >
        <div class="flex items-start justify-between">
          <span class="text-[10px] font-semibold tracking-[0.18em] uppercase">Aurelia</span>
          <span class="h-0.5 w-6 rounded-full" :style="{ background: 'var(--p-accent)' }" />
        </div>
        <div class="flex flex-col gap-0.5">
          <span
            v-for="item in CONTACT"
            :key="item.value"
            class="flex items-center gap-1.5 text-[9px]"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            <component :is="item.icon" class="size-2.5 shrink-0" :style="{ color: 'var(--p-primary)' }" />
            {{ item.value }}
          </span>
        </div>
      </div>

      <!-- Letterhead corner -->
      <div
        class="overflow-hidden rounded-md border shadow-sm"
        :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
      >
        <div class="h-1" :style="{ background: 'var(--p-primary)' }" />
        <div class="flex flex-col gap-2 p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="size-3 rounded-[4px]" :style="{ background: 'var(--p-primary)' }" />
              <span class="text-[11px] font-semibold tracking-tight">Aurelia</span>
            </div>
            <div class="text-right text-[8px] leading-snug" :style="{ color: 'var(--p-text-muted)' }">
              <p>412 SE Ash Street</p>
              <p>Portland, OR 97214</p>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-[9px] font-medium">Statement of work — Q3 rebrand</span>
            <span
              v-for="(width, index) in ['96%', '88%', '92%', '70%']"
              :key="index"
              class="block h-1 rounded-full"
              :style="{ width, background: tint('--p-text', index === 3 ? 10 : 16) }"
            />
            <span
              class="mt-0.5 block h-1 w-[42%] rounded-full"
              :style="{ background: 'var(--p-accent)' }"
            />
          </div>
        </div>
      </div>

      <!-- Lockup, in color and in one tone -->
      <div
        class="flex flex-col justify-center gap-3 rounded-md border p-3"
        :style="{ background: 'var(--p-surface-alt)', borderColor: 'var(--p-border)' }"
      >
        <div class="flex items-center gap-2">
          <svg viewBox="0 0 24 24" class="size-7 shrink-0" role="img" aria-label="Aurelia lockup">
            <rect x="1" y="1" width="14" height="14" rx="4" fill="var(--p-primary)" />
            <circle cx="16" cy="16" r="7" fill="var(--p-accent)" />
          </svg>
          <div>
            <p class="text-[14px] leading-none font-semibold tracking-tight">Aurelia</p>
            <p class="mt-1 text-[8px] tracking-[0.22em] uppercase" :style="{ color: 'var(--p-text-muted)' }">
              Brand systems
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2" :style="{ color: 'var(--p-text)' }">
          <svg viewBox="0 0 24 24" class="size-5 shrink-0" role="img" aria-label="Aurelia mark, one tone">
            <rect x="1" y="1" width="14" height="14" rx="4" fill="currentColor" />
            <circle cx="16" cy="16" r="7" fill="currentColor" opacity="0.55" />
          </svg>
          <p class="text-[11px] font-semibold tracking-tight">Aurelia</p>
          <span class="ml-auto text-[8px]" :style="{ color: 'var(--p-text-muted)' }">
            one-tone
          </span>
        </div>
      </div>
    </div>

    <!-- Swatch legend -->
    <div class="flex flex-col gap-1.5">
      <p
        class="text-[9px] font-medium tracking-wide uppercase"
        :style="{ color: 'var(--p-text-muted)' }"
      >
        Palette
      </p>
      <div class="grid grid-cols-2 gap-1.5 @lg:grid-cols-3 @2xl:grid-cols-4">
        <div
          v-for="(chip, index) in legend"
          :key="index"
          class="flex items-center gap-1.5 rounded-[4px] border px-1.5 py-1"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
        >
          <span
            class="size-3.5 shrink-0 rounded-[3px] border"
            :style="{ background: chip.fill, borderColor: 'var(--p-border)' }"
          />
          <span class="font-mono text-[9px] tabular-nums">{{ chip.hex }}</span>
        </div>
        <div
          v-if="overflow"
          class="flex items-center rounded-[4px] border border-dashed px-1.5 py-1 text-[9px]"
          :style="{ borderColor: 'var(--p-border-strong)', color: 'var(--p-text-muted)' }"
        >
          +{{ overflow }} more
        </div>
      </div>
    </div>
  </div>
</template>
