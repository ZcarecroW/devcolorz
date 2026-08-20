<script setup lang="ts">
/**
 * A typographic poster: oversized display type, a diagonal chart band and a
 * measured strip of every ramp step along the bottom.
 *
 * The decision worth knowing: the headline scales with `cqw` off this
 * component's own container, so the same markup reads as a poster in a 60rem
 * panel and as a book cover in a 26rem sidebar. Display type is where a palette
 * is least forgiving — a hue that looks rich in a 12px chip can turn muddy the
 * moment it fills half the page.
 */
import { computed } from 'vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

/**
 * A forty-color palette cannot show forty labelled bands legibly, so the strip
 * caps the number of labels and lets the bands themselves carry the rest.
 */
const bands = computed(() => {
  const n = rampCount.value
  const labelled = n <= 12
  return Array.from({ length: n }, (_, i) => ({
    color: ramp(i),
    label: labelled ? String(i + 1).padStart(2, '0') : '',
  }))
})

const colophon = [
  ['Space', 'OKLCH'],
  ['Metric', 'APCA Lc'],
  ['Gamut', 'Display P3'],
]
</script>

<template>
  <div
    class="@container w-full p-3 @xl:p-6"
    :style="{ background: 'var(--p-surface-alt)', color: 'var(--p-text)' }"
  >
    <div
      class="relative flex min-h-[26rem] flex-col overflow-hidden rounded-lg p-5 @xl:min-h-[38rem] @xl:p-10"
      :style="{ background: 'var(--p-background)', boxShadow: '0 24px 60px -40px var(--p-overlay)' }"
    >
      <!-- Masthead -->
      <div
        class="flex items-center gap-2 border-b pb-2 font-mono text-[9px] tracking-[0.28em] uppercase @xl:text-[11px]"
        :style="{ borderColor: 'var(--p-text)', color: 'var(--p-text)' }"
      >
        <span>Issue 07</span>
        <span :style="{ color: 'var(--p-text-muted)' }">/</span>
        <span>Devcolorz</span>
        <span class="flex-1" />
        <span class="hidden @lg:inline">{{ colors.length }} colors</span>
        <InfoHint
          title="Type at display size"
          wide
          class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
          text="Headline type is the least forgiving surface a palette has. A hue that looks rich as a 12px chip fills half the page here, and any muddiness in it — a chroma that is too low for the lightness, or a hue sitting in the olive band — becomes the first thing you see. If a line reads well at this size it will read well anywhere; the reverse is not true."
        />
      </div>

      <!-- Headline -->
      <div class="mt-6 leading-[0.82] font-black tracking-[-0.03em] uppercase @xl:mt-10">
        <div
          class="text-[clamp(2rem,15cqw,8rem)]"
          :style="{ color: 'var(--p-text)' }"
        >
          Color
        </div>
        <div
          class="text-[clamp(2rem,15cqw,8rem)]"
          :style="{ color: 'var(--p-primary)' }"
        >
          Is a
        </div>
        <div
          class="text-[clamp(2rem,15cqw,8rem)]"
          :style="{
            color: 'transparent',
            WebkitTextStroke: '1.5px var(--p-accent)',
          }"
        >
          System
        </div>
      </div>

      <!-- Diagonal band, so the chart series appear at poster scale -->
      <div class="relative mt-6 h-10 -skew-y-2 overflow-hidden rounded-sm @xl:mt-10 @xl:h-16">
        <div class="flex h-full">
          <span
            v-for="c in 6"
            :key="c"
            class="flex-1"
            :style="{ background: `var(--p-chart-${c})` }"
          />
        </div>
      </div>

      <!-- Standfirst -->
      <div class="mt-6 grid gap-4 @xl:mt-10 @2xl:grid-cols-[1.6fr_1fr] @2xl:gap-10">
        <p class="text-sm leading-relaxed text-pretty @xl:text-base">
          Nine hundred palettes, one conclusion: the teams that ship a coherent
          product are not the ones with the best-looking swatches. They are the
          ones who decided what each color <em class="not-italic" :style="{ color: 'var(--p-accent)' }">means</em>
          before they decided what it looks like, and then held that meaning
          across every surface they own.
        </p>
        <dl class="flex flex-col gap-1.5 font-mono text-[10px] @xl:text-[11px]">
          <div
            v-for="row in colophon"
            :key="row[0]"
            class="flex items-center gap-2 border-b pb-1.5"
            :style="{ borderColor: 'var(--p-border)' }"
          >
            <dt class="tracking-wide uppercase" :style="{ color: 'var(--p-text-muted)' }">
              {{ row[0] }}
            </dt>
            <dd class="flex-1 text-right">{{ row[1] }}</dd>
          </div>
        </dl>
      </div>

      <span class="flex-1" />

      <!-- Ramp strip -->
      <div class="mt-8">
        <div class="flex h-12 overflow-hidden rounded-sm @xl:h-20">
          <span
            v-for="(band, i) in bands"
            :key="i"
            class="min-w-0 flex-1"
            :style="{ background: band.color }"
          />
        </div>
        <div v-if="bands[0]?.label" class="mt-1 flex font-mono text-[9px]">
          <span
            v-for="(band, i) in bands"
            :key="i"
            class="min-w-0 flex-1 truncate text-center"
            :style="{ color: 'var(--p-text-muted)' }"
          >
            {{ band.label }}
          </span>
        </div>
        <div
          v-else
          class="mt-1 flex items-center gap-2 font-mono text-[9px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <span>01</span>
          <span class="h-px flex-1" :style="{ background: 'var(--p-border)' }" />
          <span>{{ String(bands.length).padStart(2, '0') }}</span>
        </div>
      </div>

      <!-- Footer rule -->
      <div
        class="mt-4 flex items-center gap-2 border-t pt-2 font-mono text-[9px] tracking-[0.28em] uppercase @xl:text-[10px]"
        :style="{ borderColor: 'var(--p-text)', color: 'var(--p-text-muted)' }"
      >
        <span>Printed in OKLCH</span>
        <span class="flex-1" />
        <span :style="{ color: 'var(--p-secondary)' }">Vol. II</span>
      </div>
    </div>
  </div>
</template>
