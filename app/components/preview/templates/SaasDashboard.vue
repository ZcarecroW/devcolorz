<script setup lang="ts">
/**
 * An application shell: sidebar, stat cards, two charts and a table.
 *
 * The charts are hand-rolled SVG rather than a library because the point is to
 * test `--p-chart-1..6` against each other and against the surface they sit
 * on — a chart library would bring its own palette and hide exactly the
 * failure we are looking for. Geometry is computed once in script so the
 * markup stays readable; nothing here recalculates on render.
 */
import { Bell, ChartColumn, House, Inbox, Search, Settings, Users } from '@lucide/vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const NAV = [
  { icon: House, label: 'Overview', active: true },
  { icon: ChartColumn, label: 'Reports', active: false },
  { icon: Users, label: 'Customers', active: false },
  { icon: Inbox, label: 'Requests', active: false },
  { icon: Settings, label: 'Settings', active: false },
]

const STATS = [
  { label: 'MRR', value: '$48,210', delta: '+12.4%', up: true },
  { label: 'Active seats', value: '1,284', delta: '+3.1%', up: true },
  { label: 'Churn', value: '1.8%', delta: '-0.4pt', up: true },
  { label: 'Open tickets', value: '37', delta: '+9', up: false },
]

/* ---------------- bar chart ---------------- */

const CHART_W = 240
const CHART_H = 96
const PLOT_TOP = 8
const PLOT_BOTTOM = 88

const BAR_LABELS = ['Direct', 'Search', 'Partner', 'Email', 'Social', 'Events']
const BAR_VALUES = [0.62, 0.88, 0.41, 0.74, 0.53, 0.29]

const bars = BAR_VALUES.map((value, index) => {
  const slot = CHART_W / BAR_VALUES.length
  const width = slot * 0.56
  const height = (PLOT_BOTTOM - PLOT_TOP) * value
  return {
    x: index * slot + (slot - width) / 2,
    y: PLOT_BOTTOM - height,
    width,
    height,
    fill: `var(--p-chart-${index + 1})`,
    label: BAR_LABELS[index],
  }
})

const gridLines = [0.25, 0.5, 0.75, 1].map(
  (t) => PLOT_BOTTOM - (PLOT_BOTTOM - PLOT_TOP) * t,
)

/* ---------------- line chart ---------------- */

const SERIES: Array<{ series: number; label: string; values: number[] }> = [
  { series: 1, label: 'Pro', values: [0.28, 0.36, 0.33, 0.48, 0.55, 0.52, 0.68, 0.79] },
  { series: 3, label: 'Team', values: [0.18, 0.22, 0.31, 0.29, 0.4, 0.47, 0.44, 0.58] },
  { series: 5, label: 'Free', values: [0.52, 0.48, 0.55, 0.42, 0.38, 0.34, 0.31, 0.26] },
]

function pointsFor(values: number[]): string {
  const step = CHART_W / (values.length - 1)
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(PLOT_BOTTOM - (PLOT_BOTTOM - PLOT_TOP) * v).toFixed(1)}`)
    .join(' ')
}

const lines = SERIES.map((entry) => ({
  ...entry,
  stroke: `var(--p-chart-${entry.series})`,
  points: pointsFor(entry.values),
  area: `0,${PLOT_BOTTOM} ${pointsFor(entry.values)} ${CHART_W},${PLOT_BOTTOM}`,
}))

/* ---------------- table ---------------- */

const ROWS = [
  { name: 'Northwind Traders', plan: 'Enterprise', mrr: '$4,800', status: 'Active', role: '--p-success' },
  { name: 'Bellwether Studio', plan: 'Team', mrr: '$1,240', status: 'Trial', role: '--p-info' },
  { name: 'Orchard & Sons', plan: 'Team', mrr: '$960', status: 'Past due', role: '--p-warning' },
  { name: 'Kestrel Analytics', plan: 'Pro', mrr: '$430', status: 'Churned', role: '--p-danger' },
]

const tint = (role: string, amount: number) =>
  `color-mix(in oklab, var(${role}) ${amount}%, var(--p-surface))`
</script>

<template>
  <div
    class="@container flex min-h-full"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Sidebar: the first thing to go when the pane is narrow -->
    <div
      class="hidden w-[9rem] shrink-0 flex-col gap-3 border-r px-2.5 py-3 @2xl:flex"
      :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
    >
      <div class="flex items-center gap-1.5 px-1">
        <div class="size-4 rounded-[5px]" :style="{ background: 'var(--p-primary)' }" />
        <span class="text-[12px] font-semibold tracking-tight">Meridian</span>
      </div>
      <div class="flex flex-col gap-0.5">
        <div
          v-for="item in NAV"
          :key="item.label"
          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]"
          :style="
            item.active
              ? { background: tint('--p-primary', 14), color: 'var(--p-primary)', fontWeight: 500 }
              : { color: 'var(--p-text-muted)' }
          "
        >
          <component :is="item.icon" class="size-3.5" />
          {{ item.label }}
        </div>
      </div>
      <div
        class="mt-auto rounded-md border p-2"
        :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface-alt)' }"
      >
        <p class="text-[10px] font-medium">Trial ends in 6 days</p>
        <div
          class="mt-1.5 h-1 overflow-hidden rounded-full"
          :style="{ background: 'var(--p-border)' }"
        >
          <div class="h-full w-[62%] rounded-full" :style="{ background: 'var(--p-accent)' }" />
        </div>
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Top bar -->
      <div
        class="flex items-center gap-2 border-b px-3 py-2"
        :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface)' }"
      >
        <span class="text-[12px] font-semibold tracking-tight">Overview</span>
        <div
          class="ml-2 hidden min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1 @lg:flex"
          :style="{ borderColor: 'var(--p-border)', background: 'var(--p-background)' }"
        >
          <Search class="size-3 shrink-0" :style="{ color: 'var(--p-text-muted)' }" />
          <span class="truncate text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
            Search customers, invoices, events
          </span>
        </div>
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <Bell class="size-3.5" :style="{ color: 'var(--p-text-muted)' }" />
          <span
            class="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold"
            :style="{ background: 'var(--p-accent)', color: 'var(--p-text-on-accent)' }"
          >
            AR
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-3 p-3">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <div
            v-for="stat in STATS"
            :key="stat.label"
            class="rounded-lg border p-2.5"
            :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
          >
            <p class="text-[10px]" :style="{ color: 'var(--p-text-muted)' }">{{ stat.label }}</p>
            <p class="mt-0.5 text-[15px] leading-none font-semibold tabular-nums">
              {{ stat.value }}
            </p>
            <p
              class="mt-1 text-[10px] font-medium tabular-nums"
              :style="{ color: stat.up ? 'var(--p-success)' : 'var(--p-danger)' }"
            >
              {{ stat.delta }}
              <span :style="{ color: 'var(--p-text-muted)' }">vs. last month</span>
            </p>
          </div>
        </div>

        <div class="grid gap-2 @2xl:grid-cols-2">
          <!-- Bar chart -->
          <div
            class="rounded-lg border p-2.5"
            :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
          >
            <p class="mb-1.5 text-[11px] font-medium">Signups by channel</p>
            <svg
              :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
              class="h-20 w-full"
              role="img"
              aria-label="Bar chart of signups by channel"
            >
              <line
                v-for="(y, index) in gridLines"
                :key="index"
                x1="0"
                :y1="y"
                :x2="CHART_W"
                :y2="y"
                stroke="var(--p-border)"
                stroke-width="1"
              />
              <rect
                v-for="bar in bars"
                :key="bar.label"
                :x="bar.x"
                :y="bar.y"
                :width="bar.width"
                :height="bar.height"
                :fill="bar.fill"
                rx="2"
              />
            </svg>
            <div
              class="mt-1 flex justify-between text-[8px]"
              :style="{ color: 'var(--p-text-muted)' }"
            >
              <span v-for="bar in bars" :key="bar.label" class="flex-1 text-center">
                {{ bar.label }}
              </span>
            </div>
          </div>

          <!-- Line chart -->
          <div
            class="rounded-lg border p-2.5"
            :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
          >
            <p class="mb-1.5 text-[11px] font-medium">Seats by plan</p>
            <svg
              :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
              class="h-20 w-full"
              role="img"
              aria-label="Line chart of seats by plan"
            >
              <line
                v-for="(y, index) in gridLines"
                :key="index"
                x1="0"
                :y1="y"
                :x2="CHART_W"
                :y2="y"
                stroke="var(--p-border)"
                stroke-width="1"
              />
              <polygon
                :points="lines[0].area"
                :fill="`color-mix(in oklab, ${lines[0].stroke} 18%, transparent)`"
              />
              <polyline
                v-for="line in lines"
                :key="line.label"
                :points="line.points"
                fill="none"
                :stroke="line.stroke"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <div class="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
              <span
                v-for="line in lines"
                :key="line.label"
                class="inline-flex items-center gap-1 text-[9px]"
                :style="{ color: 'var(--p-text-muted)' }"
              >
                <span class="size-1.5 rounded-full" :style="{ background: line.stroke }" />
                {{ line.label }}
              </span>
            </div>
          </div>
        </div>

        <!-- Table -->
        <div
          class="overflow-hidden rounded-lg border"
          :style="{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }"
        >
          <div
            class="grid grid-cols-[1.6fr_1fr_0.8fr_0.9fr] gap-2 border-b px-2.5 py-1.5 text-[9px] font-medium tracking-wide uppercase"
            :style="{ borderColor: 'var(--p-border)', background: 'var(--p-surface-alt)', color: 'var(--p-text-muted)' }"
          >
            <span>Customer</span>
            <span>Plan</span>
            <span class="text-right">MRR</span>
            <span class="text-right">Status</span>
          </div>
          <div
            v-for="row in ROWS"
            :key="row.name"
            class="grid grid-cols-[1.6fr_1fr_0.8fr_0.9fr] items-center gap-2 border-b px-2.5 py-1.5 text-[10px] last:border-b-0"
            :style="{ borderColor: 'var(--p-border)' }"
          >
            <span class="truncate font-medium">{{ row.name }}</span>
            <span :style="{ color: 'var(--p-text-muted)' }">{{ row.plan }}</span>
            <span class="text-right tabular-nums">{{ row.mrr }}</span>
            <span class="flex justify-end">
              <span
                class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                :style="{ background: tint(row.role, 16), color: `var(${row.role})` }"
              >
                <span class="size-1 rounded-full" :style="{ background: `var(${row.role})` }" />
                {{ row.status }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
