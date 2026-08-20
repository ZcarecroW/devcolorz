<script setup lang="ts">
/**
 * A month grid with events colored from the ramp.
 *
 * The decision worth knowing: event chips are a tint of a ramp step with the
 * label on `--p-text`, and each calendar keeps the same ramp index everywhere
 * it appears. Consistency is the whole job of a calendar palette — a chip has
 * no room for a name, so if two calendars cannot be told apart at 9px the color
 * assignment has failed regardless of how the chips look on their own.
 */
import { computed } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_IN_MONTH = 31
const TODAY = 12

/** Each calendar owns a ramp index for the whole view, chips and legend alike. */
const calendars = [
  { name: 'Design', ramp: 0 },
  { name: 'Engineering', ramp: 3 },
  { name: 'Personal', ramp: 6 },
  { name: 'On call', ramp: 9 },
]

interface CalendarEvent {
  label: string
  time: string
  calendar: number
}

const events: Record<number, CalendarEvent[]> = {
  3: [{ label: 'Ramp review', time: '10:00', calendar: 0 }],
  5: [
    { label: 'Standup', time: '09:15', calendar: 1 },
    { label: 'Token sync', time: '14:00', calendar: 0 },
  ],
  9: [{ label: 'Contrast audit', time: '11:30', calendar: 1 }],
  12: [
    { label: 'Design crit', time: '09:30', calendar: 0 },
    { label: 'Release cut', time: '16:00', calendar: 1 },
    { label: 'Dentist', time: '18:15', calendar: 2 },
  ],
  13: [{ label: 'Pager handover', time: '08:00', calendar: 3 }],
  17: [{ label: 'Palette workshop', time: '13:00', calendar: 0 }],
  20: [
    { label: 'Retro', time: '15:00', calendar: 1 },
    { label: 'Flight to LIS', time: '20:40', calendar: 2 },
  ],
  24: [{ label: 'Q2 planning', time: '10:00', calendar: 1 }],
  26: [{ label: 'CVD testing', time: '11:00', calendar: 0 }],
  30: [{ label: 'On call starts', time: '00:00', calendar: 3 }],
}

interface Cell {
  key: string
  day: number
  outside: boolean
  today: boolean
  events: CalendarEvent[]
}

/** March 2026 starts on a Sunday, so the grid needs no leading blanks. */
const cells = computed<Cell[]>(() =>
  Array.from({ length: 35 }, (_, i) => {
    const day = i + 1
    const outside = day > DAYS_IN_MONTH
    return {
      key: `d${day}`,
      day: outside ? day - DAYS_IN_MONTH : day,
      outside,
      today: !outside && day === TODAY,
      events: outside ? [] : (events[day] ?? []),
    }
  }),
)

function calendarRamp(index: number): string {
  return ramp(calendars[index]?.ramp ?? index)
}
</script>

<template>
  <div
    class="@container w-full p-4 @xl:p-6"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Header -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <CalendarDays class="size-4 shrink-0" :style="{ color: 'var(--p-primary)' }" />
      <span class="text-sm font-semibold tracking-tight">March 2026</span>
      <span
        class="flex items-center rounded-lg"
        :style="{ boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <span class="grid size-6 place-items-center" :style="{ color: 'var(--p-text-muted)' }">
          <ChevronLeft class="size-3.5" />
        </span>
        <span class="h-4 w-px" :style="{ background: 'var(--p-border)' }" />
        <span class="grid size-6 place-items-center" :style="{ color: 'var(--p-text-muted)' }">
          <ChevronRight class="size-3.5" />
        </span>
      </span>
      <span class="flex-1" />
      <span
        class="hidden items-center rounded-lg p-0.5 text-[11px] @lg:flex"
        :style="{ background: 'var(--p-surface-alt)' }"
      >
        <span
          v-for="(view, i) in ['Month', 'Week', 'Day']"
          :key="view"
          class="rounded-md px-2 py-1"
          :style="
            i === 0
              ? { background: 'var(--p-surface)', color: 'var(--p-text)' }
              : { color: 'var(--p-text-muted)' }
          "
        >
          {{ view }}
        </span>
      </span>
      <span
        class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
        :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
      >
        <Plus class="size-3.5" /> New
      </span>
      <InfoHint
        title="Nine pixels of color"
        wide
        class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
        text="Each calendar keeps one ramp index across the grid and the legend, so the only thing telling two events apart is a dot a few pixels wide. That is a far harder ask than a chart legend, where every series gets a label sitting right next to it. If you cannot match a chip back to its calendar without reading the text, the ramp steps in use are too close in hue and lightness."
      />
    </div>

    <!-- Weekday header -->
    <div class="grid grid-cols-7 gap-px">
      <span
        v-for="day in WEEKDAYS"
        :key="day"
        class="px-1 pb-1 text-center text-[9px] font-medium tracking-wide uppercase @lg:text-[10px]"
        :style="{ color: 'var(--p-text-muted)' }"
      >
        {{ day }}
      </span>
    </div>

    <!-- Month grid -->
    <div
      class="grid grid-cols-7 gap-px overflow-hidden rounded-lg"
      :style="{ background: 'var(--p-border)' }"
    >
      <div
        v-for="cell in cells"
        :key="cell.key"
        class="flex min-h-14 flex-col gap-0.5 p-1 @lg:min-h-20 @lg:p-1.5"
        :style="{
          background: cell.outside ? 'var(--p-surface-alt)' : 'var(--p-surface)',
          opacity: cell.outside ? 0.6 : 1,
        }"
      >
        <span
          class="grid size-5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums"
          :style="
            cell.today
              ? { background: 'var(--p-primary)', color: 'var(--p-text-on-primary)', fontWeight: 600 }
              : { color: cell.outside ? 'var(--p-text-muted)' : 'var(--p-text)' }
          "
        >
          {{ cell.day }}
        </span>

        <span
          v-for="(event, e) in cell.events.slice(0, 2)"
          :key="e"
          class="flex min-w-0 items-center gap-1 rounded px-1 py-px text-[8px] leading-tight @lg:text-[10px]"
          :style="{
            background: `color-mix(in oklab, ${calendarRamp(event.calendar)} 18%, var(--p-surface))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${calendarRamp(event.calendar)} 42%, transparent)`,
          }"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :style="{ background: calendarRamp(event.calendar) }"
          />
          <span
            class="hidden shrink-0 tabular-nums @2xl:inline"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            {{ event.time }}
          </span>
          <span class="truncate">{{ event.label }}</span>
        </span>

        <span
          v-if="cell.events.length > 2"
          class="px-1 text-[8px] @lg:text-[10px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          +{{ cell.events.length - 2 }} more
        </span>
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <span
        v-for="(calendar, i) in calendars"
        :key="calendar.name"
        class="flex items-center gap-1.5 text-[11px]"
      >
        <span class="size-2.5 rounded-sm" :style="{ background: calendarRamp(i) }" />
        <span :style="{ color: 'var(--p-text-muted)' }">{{ calendar.name }}</span>
      </span>
      <span class="flex-1" />
      <span class="text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
        {{ rampCount }} ramp steps available
      </span>
    </div>
  </div>
</template>
