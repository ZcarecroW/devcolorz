<script setup lang="ts">
/**
 * An analytics board: KPI tiles, a donut, a stacked bar chart, a sparkline row
 * and a heatmap — every mark drawn as inline SVG from `--p-chart-*` and
 * `--p-ramp-*`.
 *
 * The decision worth knowing: the donut and the bars use the *chart* series
 * (chosen for mutual distinctness) while the heatmap uses the *ramp* (ordered
 * by lightness). Categorical and sequential data want opposite things from a
 * palette, and putting both on one screen is the fastest way to see whether a
 * palette can do both jobs or only one.
 */
import { computed } from 'vue'
import { ArrowDownRight, ArrowUpRight } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const chartCount = computed(() => Math.max(1, props.roles.chart.length))
function chart(index: number): string {
  const n = chartCount.value
  return `var(--p-chart-${(((index % n) + n) % n) + 1})`
}

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

/* ---------------- KPI tiles ---------------- */

const kpis = [
  { label: 'Palettes exported', value: '12,480', delta: '+18.2%', up: true },
  { label: 'Median contrast', value: 'Lc 78', delta: '+4.1', up: true },
  { label: 'Failed gates', value: '2.4%', delta: '-0.9pt', up: false },
]

/* ---------------- Donut ---------------- */

const slices = [
  { label: 'Tailwind', value: 34 },
  { label: 'CSS vars', value: 26 },
  { label: 'Figma', value: 17 },
  { label: 'SCSS', value: 11 },
  { label: 'Swift', value: 8 },
  { label: 'Android', value: 4 },
]

const RADIUS = 38
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const donut = computed(() => {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let offset = 0
  return slices.map((slice, i) => {
    const fraction = slice.value / total
    const segment = {
      ...slice,
      color: chart(i),
      percent: Math.round(fraction * 100),
      // A one-pixel gap between arcs reads as separation even when two
      // adjacent series are perceptually close.
      dash: `${Math.max(0, fraction * CIRCUMFERENCE - 1.5)} ${CIRCUMFERENCE}`,
      offset: -offset * CIRCUMFERENCE,
    }
    offset += fraction
    return segment
  })
})

/* ---------------- Stacked bars ---------------- */

const BAR_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const bars = computed(() =>
  BAR_LABELS.map((label, i) => {
    // Deterministic so the preview never jitters between renders.
    const a = 22 + ((i * 17) % 26)
    const b = 14 + ((i * 29) % 22)
    const c = 8 + ((i * 11) % 15)
    const total = a + b + c
    return { label, parts: [a, b, c], total }
  }),
)

const barMax = computed(() => Math.max(...bars.value.map((bar) => bar.total)))

/* ---------------- Sparklines ---------------- */

interface Spark {
  label: string
  value: string
  delta: string
  up: boolean
  line: string
  area: string
  color: string
}

function series(seed: number, length = 18): number[] {
  const out: number[] = []
  let v = 40 + seed * 7
  for (let i = 0; i < length; i++) {
    // A cheap deterministic walk; enough shape to judge a stroke color by.
    v += Math.sin(i * 0.7 + seed) * 9 + ((i * (seed + 3)) % 7) - 3
    out.push(Math.max(6, Math.min(94, v)))
  }
  return out
}

function toPoints(values: number[], width: number, height: number): string {
  const step = width / (values.length - 1)
  return values.map((v, i) => `${(i * step).toFixed(2)},${(height - (v / 100) * height).toFixed(2)}`).join(' ')
}

const sparks = computed<Spark[]>(() =>
  [
    { label: 'Sessions', value: '48.2k', delta: '+6.4%', up: true },
    { label: 'Exports', value: '9,104', delta: '+2.1%', up: true },
    { label: 'Bounce', value: '18.9%', delta: '-1.3pt', up: false },
  ].map((meta, i) => {
    const points = toPoints(series(i * 3 + 1), 100, 30)
    return {
      ...meta,
      color: chart(i + 1),
      line: points,
      area: `0,30 ${points} 100,30`,
    }
  }),
)

/* ---------------- Heatmap ---------------- */

const HEAT_COLS = 12
const HEAT_ROWS = 5
const HEAT_ROW_LABELS = ['00', '06', '12', '18', '24']

const heat = computed(() =>
  Array.from({ length: HEAT_ROWS }, (_, row) =>
    Array.from({ length: HEAT_COLS }, (_, col) => {
      const raw = ((row * 37 + col * 19 + row * col * 5) % 100) / 100
      return {
        value: raw,
        // Ramp index scales with value so the grid reads as one sequence;
        // opacity carries it when the palette has only a step or two.
        fill: ramp(Math.round(raw * (rampCount.value - 1))),
        opacity: 0.22 + raw * 0.78,
      }
    }),
  ),
)
</script>

<template>
  <div
    class="@container w-full p-4 @xl:p-6"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Header -->
    <div class="mb-4 flex items-center gap-2">
      <span class="min-w-0">
        <span class="block truncate text-sm font-semibold">Adoption overview</span>
        <span class="block text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
          Last 30 days · updated 4 min ago
        </span>
      </span>
      <span class="flex-1" />
      <span
        class="rounded-lg px-2.5 py-1 text-[11px]"
        :style="{ color: 'var(--p-text-muted)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        30d
      </span>
      <InfoHint
        title="Two palettes in one board"
        wide
        class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
        text="The donut and the bars use the chart series, which the role solver orders for maximum mutual distinctness. The heatmap uses the ramp, ordered by lightness, because sequential data needs a monotonic scale and a distinct-hue set would make a random-looking grid. A palette that only does one of these jobs well will look obviously lopsided here, and that is the point of showing both."
      />
    </div>

    <!-- KPI tiles -->
    <div class="mb-3 grid grid-cols-1 gap-3 @lg:grid-cols-3">
      <div
        v-for="(kpi, i) in kpis"
        :key="kpi.label"
        class="rounded-xl p-3"
        :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full" :style="{ background: chart(i) }" />
          <span class="text-[11px]" :style="{ color: 'var(--p-text-muted)' }">{{ kpi.label }}</span>
        </span>
        <span class="mt-1.5 flex items-baseline gap-2">
          <span class="text-xl font-semibold tracking-tight tabular-nums">{{ kpi.value }}</span>
          <span
            class="flex items-center gap-0.5 text-[11px] tabular-nums"
            :style="{ color: kpi.up ? 'var(--p-success)' : 'var(--p-danger)' }"
          >
            <ArrowUpRight v-if="kpi.up" class="size-3" />
            <ArrowDownRight v-else class="size-3" />
            {{ kpi.delta }}
          </span>
        </span>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 @xl:grid-cols-2">
      <!-- Donut -->
      <div
        class="rounded-xl p-3"
        :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="block text-[11px] font-medium">Export targets</span>
        <div class="mt-2 flex items-center gap-3">
          <svg viewBox="0 0 100 100" class="size-24 shrink-0" role="img" aria-label="Export targets by share">
            <circle
              cx="50"
              cy="50"
              :r="RADIUS"
              fill="none"
              stroke="var(--p-surface-alt)"
              stroke-width="15"
            />
            <circle
              v-for="segment in donut"
              :key="segment.label"
              cx="50"
              cy="50"
              :r="RADIUS"
              fill="none"
              :stroke="segment.color"
              stroke-width="15"
              :stroke-dasharray="segment.dash"
              :stroke-dashoffset="segment.offset"
              transform="rotate(-90 50 50)"
            />
            <text
              x="50"
              y="47"
              text-anchor="middle"
              font-size="15"
              font-weight="600"
              fill="var(--p-text)"
            >
              6
            </text>
            <text x="50" y="60" text-anchor="middle" font-size="8" fill="var(--p-text-muted)">
              targets
            </text>
          </svg>
          <ul class="flex min-w-0 flex-1 flex-col gap-1">
            <li
              v-for="segment in donut"
              :key="segment.label"
              class="flex items-center gap-1.5 text-[10px]"
            >
              <span class="size-2 shrink-0 rounded-sm" :style="{ background: segment.color }" />
              <span class="min-w-0 flex-1 truncate">{{ segment.label }}</span>
              <span class="tabular-nums" :style="{ color: 'var(--p-text-muted)' }">
                {{ segment.percent }}%
              </span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Stacked bars -->
      <div
        class="rounded-xl p-3"
        :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="flex items-center gap-2">
          <span class="text-[11px] font-medium">Builds by outcome</span>
          <span class="flex-1" />
          <span
            v-for="(name, i) in ['pass', 'warn', 'fail']"
            :key="name"
            class="flex items-center gap-1 text-[9px]"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            <span class="size-1.5 rounded-sm" :style="{ background: chart(i) }" />{{ name }}
          </span>
        </span>
        <svg viewBox="0 0 210 96" class="mt-3 w-full" role="img" aria-label="Builds by outcome per weekday">
          <line x1="0" y1="80" x2="210" y2="80" stroke="var(--p-border)" stroke-width="1" />
          <g v-for="(bar, i) in bars" :key="bar.label">
            <template v-for="(part, p) in bar.parts" :key="p">
              <rect
                :x="6 + i * 29"
                :y="
                  80 -
                  ((bar.parts.slice(0, p + 1).reduce((s, v) => s + v, 0) / barMax) * 74)
                "
                width="18"
                :height="(part / barMax) * 74"
                :fill="chart(p)"
                rx="2"
              />
            </template>
            <text
              :x="15 + i * 29"
              y="92"
              text-anchor="middle"
              font-size="8"
              fill="var(--p-text-muted)"
            >
              {{ bar.label }}
            </text>
          </g>
        </svg>
      </div>

      <!-- Sparkline row -->
      <div
        class="rounded-xl p-3 @xl:col-span-2"
        :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="block text-[11px] font-medium">Trends</span>
        <div class="mt-2 grid grid-cols-1 gap-3 @lg:grid-cols-3">
          <div
            v-for="spark in sparks"
            :key="spark.label"
            class="rounded-lg p-2"
            :style="{ background: 'var(--p-surface-alt)' }"
          >
            <span class="flex items-baseline gap-2">
              <span class="text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
                {{ spark.label }}
              </span>
              <span class="flex-1" />
              <span class="text-xs font-semibold tabular-nums">{{ spark.value }}</span>
              <span
                class="text-[10px] tabular-nums"
                :style="{ color: spark.up ? 'var(--p-success)' : 'var(--p-danger)' }"
              >
                {{ spark.delta }}
              </span>
            </span>
            <svg
              viewBox="0 0 100 30"
              preserveAspectRatio="none"
              class="mt-1.5 h-8 w-full"
              role="img"
              :aria-label="`${spark.label} trend`"
            >
              <polygon
                :points="spark.area"
                :fill="`color-mix(in oklab, ${spark.color} 26%, transparent)`"
              />
              <polyline
                :points="spark.line"
                fill="none"
                :stroke="spark.color"
                stroke-width="1.6"
                stroke-linejoin="round"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Heatmap -->
      <div
        class="rounded-xl p-3 @xl:col-span-2"
        :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="flex items-center gap-2">
          <span class="text-[11px] font-medium">Activity by hour</span>
          <span class="flex-1" />
          <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">low</span>
          <span
            v-for="step in 5"
            :key="step"
            class="size-2 rounded-[2px]"
            :style="{
              background: ramp(Math.round(((step - 1) / 4) * (rampCount - 1))),
              opacity: 0.22 + ((step - 1) / 4) * 0.78,
            }"
          />
          <span class="text-[9px]" :style="{ color: 'var(--p-text-muted)' }">high</span>
        </span>
        <svg
          viewBox="0 0 200 60"
          class="mt-2.5 w-full"
          role="img"
          aria-label="Activity heatmap by hour and weekday"
        >
          <g v-for="(row, r) in heat" :key="r">
            <text x="0" :y="9 + r * 11" font-size="6" fill="var(--p-text-muted)">
              {{ HEAT_ROW_LABELS[r] }}
            </text>
            <rect
              v-for="(cell, c) in row"
              :key="c"
              :x="14 + c * 15.5"
              :y="3 + r * 11"
              width="14"
              height="9"
              rx="1.5"
              :fill="cell.fill"
              :fill-opacity="cell.opacity"
            />
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>
