<script setup lang="ts">
/**
 * A music player: album art, track list, transport controls and a progress bar.
 *
 * The decision worth knowing: the album art is a conic gradient across the
 * whole ramp rather than two or three picked colors. It is the one place in the
 * set where every step of a forty-color palette is visible at once and adjacent
 * steps have to blend rather than band — the same property that decides whether
 * the palette can drive a gradient anywhere else.
 */
import { computed } from 'vue'
import {
  Heart,
  ListMusic,
  Pause,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
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

/** A full turn through the ramp, closed back on step one so it does not seam. */
const cover = computed(() => {
  const n = rampCount.value
  const stops: string[] = []
  for (let i = 0; i <= n; i++) {
    stops.push(`${ramp(i)} ${((i / n) * 360).toFixed(1)}deg`)
  }
  return `conic-gradient(from 210deg at 35% 30%, ${stops.join(', ')})`
})

interface Track {
  n: number
  title: string
  artist: string
  length: string
  playing?: boolean
  liked?: boolean
}

const tracks: Track[] = [
  { n: 1, title: 'Perceptual Uniform', artist: 'Field Notes', length: '3:42', liked: true },
  { n: 2, title: 'Chroma Falloff', artist: 'Field Notes', length: '4:18', playing: true },
  { n: 3, title: 'Gamut Boundary', artist: 'Field Notes', length: '2:55' },
  { n: 4, title: 'Hue Drift (Blues)', artist: 'Field Notes ft. Oyelaran', length: '5:07', liked: true },
  { n: 5, title: 'Tonal Ramp', artist: 'Field Notes', length: '3:29' },
  { n: 6, title: 'Out of Gamut', artist: 'Field Notes', length: '6:12' },
]

/** Fixed so the bar tells the same story on every render. */
const progress = 0.42
</script>

<template>
  <div
    class="@container w-full p-4 @xl:p-6"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <div class="grid grid-cols-1 gap-5 @xl:grid-cols-[minmax(0,15rem)_1fr] @xl:gap-6">
      <!-- Now playing -->
      <div class="flex flex-col gap-3">
        <div
          class="relative aspect-square w-full overflow-hidden rounded-2xl shadow-xl"
          :style="{ background: cover }"
        >
          <span
            class="absolute inset-0"
            :style="{
              background:
                'radial-gradient(circle at 70% 78%, transparent 45%, var(--p-overlay) 100%)',
            }"
          />
          <span
            class="absolute right-4 bottom-4 grid size-10 place-items-center rounded-full"
            :style="{ background: 'var(--p-background)' }"
          >
            <span class="size-3 rounded-full" :style="{ background: 'var(--p-primary)' }" />
          </span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
              Chroma Falloff
            </span>
            <Heart class="size-4 shrink-0" :style="{ color: 'var(--p-danger)' }" />
          </div>
          <span class="block truncate text-xs" :style="{ color: 'var(--p-text-muted)' }">
            Field Notes · Perceptual Uniform · 2026
          </span>
        </div>
      </div>

      <!-- Queue -->
      <div class="flex min-w-0 flex-col">
        <div class="mb-2 flex items-center gap-2">
          <ListMusic class="size-4" :style="{ color: 'var(--p-text-muted)' }" />
          <span class="text-[11px] tracking-wide uppercase">Up next</span>
          <span class="flex-1" />
          <span class="text-[11px] tabular-nums" :style="{ color: 'var(--p-text-muted)' }">
            6 tracks · 25:43
          </span>
          <InfoHint
            title="A gradient across the whole ramp"
            wide
            class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
            text="The album art sweeps through every step of the ramp in order and closes back on the first, so a forty-color palette shows all forty at once. Watch for banding: hard edges mean two neighbouring steps jump in lightness, which is a problem anywhere you use the palette for a gradient, a chart area fill or a hover state. A ramp that blends here will blend everywhere."
          />
        </div>

        <div
          v-for="track in tracks"
          :key="track.n"
          class="flex items-center gap-3 rounded-lg px-2 py-1.5"
          :style="
            track.playing
              ? { background: 'color-mix(in oklab, var(--p-primary) 14%, transparent)' }
              : {}
          "
        >
          <span
            class="w-4 shrink-0 text-right text-[11px] tabular-nums"
            :style="{ color: track.playing ? 'var(--p-primary)' : 'var(--p-text-muted)' }"
          >
            {{ track.n }}
          </span>
          <span
            class="size-8 shrink-0 rounded-md"
            :style="{ background: `linear-gradient(135deg, ${ramp(track.n)}, ${ramp(track.n + 4)})` }"
          />
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-xs"
              :style="{
                fontWeight: track.playing ? 600 : 500,
                color: track.playing ? 'var(--p-primary)' : 'var(--p-text)',
              }"
            >
              {{ track.title }}
            </span>
            <span class="block truncate text-[10px]" :style="{ color: 'var(--p-text-muted)' }">
              {{ track.artist }}
            </span>
          </span>
          <!-- The playing row gets a level meter instead of a duration -->
          <span v-if="track.playing" class="flex h-4 items-end gap-[2px]">
            <span
              v-for="b in 4"
              :key="b"
              class="w-[3px] animate-pulse rounded-full"
              :style="{
                height: `${30 + b * 17}%`,
                background: 'var(--p-primary)',
                animationDelay: `${b * 130}ms`,
              }"
            />
          </span>
          <Heart
            v-else-if="track.liked"
            class="size-3.5 shrink-0"
            :style="{ color: 'var(--p-danger)' }"
          />
          <span
            class="w-9 shrink-0 text-right text-[11px] tabular-nums"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            {{ track.length }}
          </span>
        </div>
      </div>
    </div>

    <!-- Transport -->
    <div
      class="mt-5 rounded-xl p-3"
      :style="{ background: 'var(--p-surface)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
    >
      <div class="flex items-center gap-2">
        <span class="text-[10px] tabular-nums" :style="{ color: 'var(--p-text-muted)' }">1:47</span>
        <span
          class="relative h-1.5 flex-1 overflow-hidden rounded-full"
          :style="{ background: 'var(--p-surface-alt)' }"
        >
          <!-- Buffered ahead of played, so two palette colors have to separate -->
          <span
            class="absolute inset-y-0 left-0 rounded-full"
            :style="{ width: '68%', background: 'var(--p-secondary)', opacity: 0.45 }"
          />
          <span
            class="absolute inset-y-0 left-0 rounded-full"
            :style="{ width: `${progress * 100}%`, background: 'var(--p-primary)' }"
          />
          <span
            class="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            :style="{
              left: `${progress * 100}%`,
              background: 'var(--p-background)',
              borderColor: 'var(--p-primary)',
            }"
          />
        </span>
        <span class="text-[10px] tabular-nums" :style="{ color: 'var(--p-text-muted)' }">4:18</span>
      </div>

      <div class="mt-3 flex items-center gap-4">
        <Shuffle class="size-4" :style="{ color: 'var(--p-accent)' }" />
        <span class="flex flex-1 items-center justify-center gap-4">
          <SkipBack class="size-5" :style="{ color: 'var(--p-text)' }" />
          <span
            class="grid size-11 place-items-center rounded-full shadow-lg"
            :style="{ background: 'var(--p-primary)', color: 'var(--p-text-on-primary)' }"
          >
            <Pause class="size-5" />
          </span>
          <SkipForward class="size-5" :style="{ color: 'var(--p-text)' }" />
        </span>
        <Repeat class="size-4" :style="{ color: 'var(--p-text-muted)' }" />
        <span class="hidden items-center gap-1.5 @lg:flex">
          <Volume2 class="size-4" :style="{ color: 'var(--p-text-muted)' }" />
          <span
            class="relative h-1 w-16 overflow-hidden rounded-full"
            :style="{ background: 'var(--p-surface-alt)' }"
          >
            <span
              class="absolute inset-y-0 left-0 w-3/5 rounded-full"
              :style="{ background: 'var(--p-text-muted)' }"
            />
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
