<script setup lang="ts">
/**
 * A four-column board of work cards with ramp-colored labels.
 *
 * The decision worth knowing: label chips are a tint of a ramp color with the
 * *text* left on `--p-text` and only a dot in the ramp color itself. Coloring
 * chip text directly is how palette demos cheat — it fails the moment a ramp
 * step sits near the surface lightness — and a dot stays legible at any step.
 */
import { computed } from 'vue'
import { Ellipsis, MessageSquare, Paperclip, Plus } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

interface Card {
  title: string
  labels: Array<{ text: string; ramp: number }>
  comments: number
  files: number
  due: string
  cover?: number
  people: number[]
}

interface Column {
  name: string
  accent: string
  cards: Card[]
}

const columns: Column[] = [
  {
    name: 'Backlog',
    accent: 'var(--p-text-muted)',
    cards: [
      {
        title: 'Audit the legacy gray scale against APCA',
        labels: [{ text: 'a11y', ramp: 0 }],
        comments: 2,
        files: 0,
        due: 'Mar 28',
        people: [0, 3],
      },
      {
        title: 'Document the ramp naming convention',
        labels: [
          { text: 'docs', ramp: 4 },
          { text: 'low', ramp: 6 },
        ],
        comments: 0,
        files: 1,
        due: 'Apr 02',
        people: [2],
      },
    ],
  },
  {
    name: 'In progress',
    accent: 'var(--p-info)',
    cards: [
      {
        title: 'Chroma falloff at the dark end of the blues',
        labels: [{ text: 'engine', ramp: 1 }],
        comments: 6,
        files: 2,
        due: 'Today',
        cover: 2,
        people: [1, 4, 5],
      },
      {
        title: 'Export: Tailwind v4 @theme block',
        labels: [
          { text: 'export', ramp: 3 },
          { text: 'p1', ramp: 5 },
        ],
        comments: 3,
        files: 0,
        due: 'Mar 21',
        people: [0],
      },
    ],
  },
  {
    name: 'Review',
    accent: 'var(--p-warning)',
    cards: [
      {
        title: 'Role solver picks a second gray as accent',
        labels: [{ text: 'bug', ramp: 2 }],
        comments: 11,
        files: 3,
        due: 'Mar 19',
        people: [3, 1],
      },
    ],
  },
  {
    name: 'Shipped',
    accent: 'var(--p-success)',
    cards: [
      {
        title: 'Share links carry the generator seed',
        labels: [{ text: 'shipped', ramp: 7 }],
        comments: 1,
        files: 0,
        due: 'Mar 14',
        people: [2, 0],
      },
      {
        title: 'CVD simulation in the swatch strip',
        labels: [{ text: 'a11y', ramp: 0 }],
        comments: 4,
        files: 1,
        due: 'Mar 11',
        people: [5],
      },
    ],
  },
]
</script>

<template>
  <div
    class="@container flex w-full flex-col"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Board header -->
    <div
      class="flex items-center gap-3 border-b px-4 py-3"
      :style="{ borderColor: 'var(--p-border)' }"
    >
      <span class="min-w-0">
        <span class="block truncate text-sm font-semibold">Color engine · Q1</span>
        <span class="block text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
          7 open · 2 blocked
        </span>
      </span>
      <span class="flex-1" />
      <span class="-space-x-2 flex">
        <span
          v-for="p in 4"
          :key="p"
          class="size-6 rounded-full border-2"
          :style="{ background: ramp(p * 2), borderColor: 'var(--p-background)' }"
        />
      </span>
      <span
        class="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium @lg:inline-flex"
        :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
      >
        <Plus class="size-3.5" /> New
      </span>
      <InfoHint
        title="Labels and the ramp"
        wide
        class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
        text="Each label chip is a 14% tint of one ramp step, with the chip text left on the normal text color and only the dot painted from the ramp. Coloring chip text directly looks better in a screenshot and breaks the moment a ramp step lands near the card surface, which happens often in low-contrast palettes. If two dots here are indistinguishable, the ramp needs more hue separation, not more steps."
      />
    </div>

    <!-- Columns. Scrolls horizontally in a sidebar, fits whole in a wide panel. -->
    <div class="flex gap-3 overflow-x-auto p-4">
      <div
        v-for="column in columns"
        :key="column.name"
        class="flex w-56 shrink-0 flex-col gap-2 rounded-xl p-2"
        :style="{ background: 'var(--p-surface-alt)' }"
      >
        <div class="flex items-center gap-2 px-1 pt-1">
          <span class="size-2 rounded-full" :style="{ background: column.accent }" />
          <span class="text-[11px] font-semibold tracking-wide uppercase">{{ column.name }}</span>
          <span
            class="rounded-full px-1.5 text-[10px] tabular-nums"
            :style="{ background: 'var(--p-background)', color: 'var(--p-text-muted)' }"
          >
            {{ column.cards.length }}
          </span>
          <span class="flex-1" />
          <Ellipsis class="size-3.5" :style="{ color: 'var(--p-text-muted)' }" />
        </div>

        <div
          v-for="card in column.cards"
          :key="card.title"
          class="overflow-hidden rounded-lg"
          :style="{
            background: 'var(--p-surface)',
            boxShadow: 'inset 0 0 0 1px var(--p-border), 0 1px 2px -1px var(--p-overlay)',
          }"
        >
          <span
            v-if="card.cover !== undefined"
            class="block h-10"
            :style="{
              background: `linear-gradient(110deg, ${ramp(card.cover)}, ${ramp(card.cover + 3)})`,
            }"
          />
          <span class="block p-2.5">
            <span class="mb-2 flex flex-wrap gap-1">
              <span
                v-for="label in card.labels"
                :key="label.text"
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                :style="{
                  background: `color-mix(in oklab, ${ramp(label.ramp)} 14%, var(--p-surface))`,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ramp(label.ramp)} 45%, transparent)`,
                }"
              >
                <span class="size-1.5 rounded-full" :style="{ background: ramp(label.ramp) }" />
                {{ label.text }}
              </span>
            </span>
            <span class="block text-xs leading-snug font-medium text-pretty">{{ card.title }}</span>
            <span class="mt-2.5 flex items-center gap-2 text-[10px] tabular-nums">
              <span class="-space-x-1.5 flex">
                <span
                  v-for="person in card.people"
                  :key="person"
                  class="size-4 rounded-full border"
                  :style="{ background: ramp(person), borderColor: 'var(--p-surface)' }"
                />
              </span>
              <span class="flex-1" />
              <span
                v-if="card.comments"
                class="flex items-center gap-0.5"
                :style="{ color: 'var(--p-text-muted)' }"
              >
                <MessageSquare class="size-3" />{{ card.comments }}
              </span>
              <span
                v-if="card.files"
                class="flex items-center gap-0.5"
                :style="{ color: 'var(--p-text-muted)' }"
              >
                <Paperclip class="size-3" />{{ card.files }}
              </span>
              <span
                class="rounded px-1 py-px"
                :style="{
                  color: card.due === 'Today' ? 'var(--p-danger)' : 'var(--p-text-muted)',
                  background:
                    card.due === 'Today'
                      ? 'color-mix(in oklab, var(--p-danger) 14%, transparent)'
                      : 'transparent',
                }"
              >
                {{ card.due }}
              </span>
            </span>
          </span>
        </div>

        <span
          class="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <Plus class="size-3" /> Add card
        </span>
      </div>
    </div>
  </div>
</template>
