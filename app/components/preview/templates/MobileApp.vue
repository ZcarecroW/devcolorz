<script setup lang="ts">
/**
 * A phone screen built entirely from the palette: status bar, header, activity
 * feed, tab bar and a floating action button.
 *
 * The decision worth knowing: list thumbnails come from the ramp, not from a
 * semantic role. A feed is where a palette's *quantity* shows — five thumbnails
 * stacked reveal clashes a single hero section hides — so the ramp index wraps
 * and a one-color palette still fills every row.
 */
import { computed } from 'vue'
import {
  BatteryFull,
  Bell,
  ChevronRight,
  House,
  Plus,
  Search,
  Signal,
  User,
  Wifi,
} from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

const rows = [
  { title: 'Northwind API', sub: 'Deploy finished · 2m ago', status: 'var(--p-success)' },
  { title: 'Ana Vasquez', sub: 'Left 3 comments on the ramp spec', status: 'var(--p-info)' },
  { title: 'Billing', sub: 'Invoice #4471 is ready', status: 'var(--p-warning)' },
  { title: 'edge-router', sub: 'Rollback queued · needs approval', status: 'var(--p-danger)' },
  { title: 'Weekly digest', sub: '14 merged, 3 still open', status: 'var(--p-accent)' },
]

const tabs = [
  { label: 'Home', icon: House, active: true },
  { label: 'Search', icon: Search, active: false },
  { label: 'Alerts', icon: Bell, active: false },
  { label: 'You', icon: User, active: false },
]

const filters = ['All', 'Unread', 'Flagged']
</script>

<template>
  <div
    class="@container flex w-full justify-center p-4 @xl:p-8"
    :style="{
      background: `linear-gradient(160deg, ${ramp(0)} 0%, var(--p-surface-alt) 45%, ${ramp(2)} 100%)`,
      color: 'var(--p-text)',
    }"
  >
    <div
      class="w-full max-w-[20rem] overflow-hidden rounded-[2rem] border shadow-2xl"
      :style="{ borderColor: 'var(--p-border-strong)', background: 'var(--p-background)' }"
    >
      <!-- Status bar -->
      <div
        class="relative flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] font-medium tabular-nums"
        :style="{ color: 'var(--p-text)' }"
      >
        <span>9:41</span>
        <span
          class="absolute top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full"
          :style="{ background: 'var(--p-text)', opacity: 0.9 }"
        />
        <span class="flex items-center gap-1">
          <Signal class="size-3" />
          <Wifi class="size-3" />
          <BatteryFull class="size-3.5" />
        </span>
      </div>

      <!-- Header -->
      <div class="flex items-center gap-3 px-4 pt-3 pb-2">
        <span
          class="size-9 shrink-0 rounded-full"
          :style="{ background: `linear-gradient(135deg, ${ramp(1)}, ${ramp(4)})` }"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
            Tuesday, 12 March
          </span>
          <span class="block truncate text-sm font-semibold">Good morning, Ana</span>
        </span>
        <span
          class="relative grid size-8 place-items-center rounded-full border"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
        >
          <Bell class="size-4" />
          <span
            class="absolute top-1.5 right-1.5 size-2 rounded-full border"
            :style="{ background: 'var(--p-danger)', borderColor: 'var(--p-surface)' }"
          />
        </span>
      </div>

      <!-- Filter pills -->
      <div class="flex items-center gap-1.5 px-4 pb-3">
        <span
          v-for="(filter, i) in filters"
          :key="filter"
          class="rounded-full px-2.5 py-1 text-[10px] font-medium"
          :style="
            i === 0
              ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }
              : {
                  background: 'var(--p-surface)',
                  color: 'var(--p-text-muted)',
                  boxShadow: 'inset 0 0 0 1px var(--p-border)',
                }
          "
        >
          {{ filter }}
        </span>
        <span class="flex-1" />
        <InfoHint
          title="Why a feed"
          wide
          class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="A phone feed is the densest test in this set: five thumbnails, five titles and five subtitles share one background at a size where nothing can be rescued by scale. If the ramp reads as one mush here, the palette has too little lightness separation, however good the hero section looks."
        />
      </div>

      <!-- Feed -->
      <div class="px-4">
        <div
          v-for="(row, i) in rows"
          :key="row.title"
          class="flex items-center gap-3 border-t py-2.5 first:border-t-0"
          :style="{ borderColor: 'var(--p-border)' }"
        >
          <span
            class="size-10 shrink-0 rounded-xl"
            :style="{
              background: `linear-gradient(140deg, ${ramp(i)}, ${ramp(i + 3)})`,
              boxShadow: 'inset 0 0 0 1px var(--p-border)',
            }"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="size-1.5 shrink-0 rounded-full" :style="{ background: row.status }" />
              <span class="truncate text-xs font-semibold">{{ row.title }}</span>
            </span>
            <span
              class="mt-0.5 block truncate text-[10px]"
              :style="{ color: 'var(--p-text-muted)' }"
            >
              {{ row.sub }}
            </span>
          </span>
          <ChevronRight class="size-4 shrink-0" :style="{ color: 'var(--p-text-muted)' }" />
        </div>
      </div>

      <!-- Tab bar with the floating action button riding above it -->
      <div class="relative mt-4">
        <span
          class="absolute -top-7 right-4 grid size-12 place-items-center rounded-full shadow-lg"
          :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
        >
          <Plus class="size-5" />
        </span>
        <div
          class="flex items-end justify-around border-t px-2 pt-2 pb-3"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
        >
          <span
            v-for="tab in tabs"
            :key="tab.label"
            class="flex flex-col items-center gap-0.5 px-2"
            :style="{ color: tab.active ? 'var(--p-primary)' : 'var(--p-text-muted)' }"
          >
            <component :is="tab.icon" class="size-4" />
            <span class="text-[9px] font-medium">{{ tab.label }}</span>
          </span>
        </div>
        <div class="flex justify-center pb-2" :style="{ background: 'var(--p-surface)' }">
          <span class="h-1 w-24 rounded-full" :style="{ background: 'var(--p-border-strong)' }" />
        </div>
      </div>
    </div>
  </div>
</template>
