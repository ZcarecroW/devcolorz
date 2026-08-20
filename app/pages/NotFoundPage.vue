<script setup lang="ts">
/**
 * The 404.
 *
 * Painted from the palette the visitor already has, or from a fresh roll when
 * they arrived here cold. A color tool that serves a grey 404 has missed an
 * easy chance to show what it does, and the colors are computed once in a
 * shallow ref so the page does not re-roll itself on every render.
 */
import { computed, shallowRef } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Compass } from '@lucide/vue'
import { bestBlackOrWhite } from '@/lib/color/contrast'
import { formatColor } from '@/lib/color/convert'
import { generatePalette, randomSeed } from '@/lib/color/random'
import type { Oklch } from '@/lib/color/types'
import { Button } from '@/components/ui/button'
import { usePaletteStore } from '@/stores/palette'

const route = useRoute()
const palette = usePaletteStore()

/** Raw colors, replaced wholesale — never wrapped in a deep proxy. */
const colors = shallowRef<Oklch[]>(
  palette.count
    ? palette.colors.slice(0, 5)
    : generatePalette({ count: 5, constraints: palette.constraints, seed: randomSeed() }),
)

const bands = computed(() =>
  colors.value.map((color, index) => ({
    key: index,
    css: formatColor(color, 'oklch'),
    text: formatColor(bestBlackOrWhite(color), 'oklch'),
  })),
)

/** The digits get one swatch each; anything shorter falls back to the first. */
const digits = ['4', '0', '4']

const attempted = computed(() => route.fullPath)
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
    <div class="flex gap-2" aria-hidden="true">
      <span
        v-for="(digit, index) in digits"
        :key="index"
        class="flex size-20 items-center justify-center rounded-xl text-4xl font-semibold tabular-nums sm:size-24 sm:text-5xl"
        :style="{ background: bands[index]?.css, color: bands[index]?.text }"
      >
        {{ digit }}
      </span>
    </div>

    <div class="flex flex-col gap-2">
      <h1 class="text-xl font-semibold tracking-tight">Nothing at this address</h1>
      <p class="text-sm text-muted-foreground">
        <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{{ attempted }}</code>
        does not match a page here. A palette link that stopped working usually means the fragment
        was truncated somewhere between copy and paste — the colors live in the part after the
        <code class="font-mono">#</code>.
      </p>
    </div>

    <div class="flex flex-wrap justify-center gap-2">
      <Button as-child>
        <RouterLink :to="{ name: 'studio' }"><ArrowLeft /> Back to the generator</RouterLink>
      </Button>
      <Button as-child variant="outline">
        <RouterLink :to="{ name: 'explore' }"><Compass /> Browse Explore</RouterLink>
      </Button>
    </div>

    <!-- A strip of the palette, so the page still shows what the tool is for. -->
    <div class="flex h-2 w-full max-w-sm overflow-hidden rounded-full">
      <span v-for="band in bands" :key="band.key" class="flex-1" :style="{ background: band.css }" />
    </div>
  </div>
</template>
