<script setup lang="ts">
/**
 * A long-form article: hero block, headline, body copy, pull quote, code block
 * and tags.
 *
 * The decision worth knowing: body copy runs at a real reading size and length
 * rather than lorem bars. Paragraph text is the only place where the gap
 * between `--p-text` and `--p-text-muted` is genuinely felt, and a muted color
 * that looks "subtle" in a card caption turns out to be unreadable here.
 */
import { computed } from 'vue'
import { Bookmark, Clock, Quote, Share2 } from '@lucide/vue'
import InfoHint from '@/components/common/InfoHint.vue'
import type { RoleMap } from '@/lib/color/roles'
import type { Oklch } from '@/lib/color/types'

const props = defineProps<{ roles: RoleMap; colors: Oklch[] }>()

const rampCount = computed(() => Math.max(1, props.roles.ramp.length))
function ramp(index: number): string {
  const n = rampCount.value
  return `var(--p-ramp-${(((index % n) + n) % n) + 1})`
}

/** Chart colors double as syntax token colors: both need mutual distinctness. */
const chartCount = computed(() => Math.max(1, props.roles.chart.length))
function chart(index: number): string {
  const n = chartCount.value
  return `var(--p-chart-${(((index % n) + n) % n) + 1})`
}

const tags = ['color-science', 'oklch', 'design-systems', 'accessibility']
</script>

<template>
  <div
    class="@container w-full"
    :style="{ background: 'var(--p-background)', color: 'var(--p-text)' }"
  >
    <!-- Hero block: a printed gradient, not a photograph -->
    <div
      class="relative flex h-40 items-end p-4 @xl:h-64 @xl:p-8"
      :style="{
        background: `linear-gradient(115deg, ${ramp(0)} 0%, ${ramp(2)} 40%, ${ramp(4)} 70%, ${ramp(6)} 100%)`,
      }"
    >
      <span
        class="absolute inset-x-0 bottom-0 h-2/3"
        :style="{ background: 'linear-gradient(to top, var(--p-overlay), transparent)' }"
      />
      <span
        class="relative rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase"
        :style="{ background: 'var(--p-background)', color: 'var(--p-primary)' }"
      >
        Color engineering
      </span>
    </div>

    <article class="mx-auto max-w-2xl px-4 py-6 @xl:px-8 @xl:py-10">
      <h1 class="text-2xl leading-tight font-semibold tracking-tight text-balance @xl:text-4xl">
        Lightness is the only channel your users actually read
      </h1>

      <!-- Byline -->
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span
          class="size-8 rounded-full"
          :style="{ background: `linear-gradient(135deg, ${ramp(1)}, ${ramp(5)})` }"
        />
        <span class="text-xs">
          <span class="block font-medium">Ana Vasquez</span>
          <span class="block" :style="{ color: 'var(--p-text-muted)' }">
            12 March 2026 · Research
          </span>
        </span>
        <span class="flex-1" />
        <span
          class="flex items-center gap-3 text-[11px]"
          :style="{ color: 'var(--p-text-muted)' }"
        >
          <span class="flex items-center gap-1"><Clock class="size-3.5" /> 9 min</span>
          <Bookmark class="size-3.5" />
          <Share2 class="size-3.5" />
          <InfoHint
            title="Why real paragraphs"
            wide
            class="text-[color:var(--p-text-muted)] hover:text-[color:var(--p-text)]"
            text="Grey placeholder bars flatter every palette, because a bar has no stroke weight and no counters to close up. Running actual sentences at 13px is the only honest test of the muted text color: it should read as quieter than the body, never as harder to read. If you find yourself squinting at the caption below, lift the muted color toward the text color rather than the background."
          />
        </span>
      </div>

      <span class="my-5 block h-px" :style="{ background: 'var(--p-border)' }" />

      <p class="text-sm leading-7 text-pretty">
        Hue gets the attention and chroma gets the arguments, but the channel that
        decides whether an interface is usable is lightness. Two colors that differ
        only in hue can sit at identical perceptual lightness, and to a large part
        of your audience — anyone on a dim laptop, anyone with reduced contrast
        sensitivity, anyone printing to grayscale — they are the same color.
      </p>

      <p class="mt-4 text-sm leading-7 text-pretty" :style="{ color: 'var(--p-text-muted)' }">
        This is why the ramp comes first in our pipeline. Fix the lightness steps,
        confirm each one clears its contrast target against the surfaces it will
        actually land on, and only then decide what hue the step should carry.
      </p>

      <!-- Pull quote -->
      <blockquote
        class="my-6 border-l-2 py-1 pl-4"
        :style="{ borderColor: 'var(--p-accent)' }"
      >
        <Quote class="mb-2 size-4" :style="{ color: 'var(--p-accent)' }" />
        <p class="text-base leading-snug font-medium text-balance @xl:text-lg">
          A palette that survives being converted to grayscale will survive almost
          anything else you do to it.
        </p>
        <cite class="mt-2 block text-[11px] not-italic" :style="{ color: 'var(--p-text-muted)' }">
          — from the internal ramp guidelines, 2024
        </cite>
      </blockquote>

      <p class="text-sm leading-7 text-pretty">
        In practice that means writing the check down. The snippet below is the
        gate we run in CI: it fails the build when any step in a ramp drops under
        its target against the page background.
      </p>

      <!-- Code block -->
      <div
        class="mt-4 overflow-hidden rounded-xl"
        :style="{ background: 'var(--p-surface-alt)', boxShadow: 'inset 0 0 0 1px var(--p-border)' }"
      >
        <div
          class="flex items-center gap-2 border-b px-3 py-1.5 text-[10px]"
          :style="{ borderColor: 'var(--p-border)', color: 'var(--p-text-muted)' }"
        >
          <span class="size-2 rounded-full" :style="{ background: 'var(--p-danger)' }" />
          <span class="size-2 rounded-full" :style="{ background: 'var(--p-warning)' }" />
          <span class="size-2 rounded-full" :style="{ background: 'var(--p-success)' }" />
          <span class="ml-1 font-mono">ramp.test.ts</span>
        </div>
        <pre
          class="overflow-x-auto px-3 py-3 font-mono text-[11px] leading-relaxed"
        ><code><span :style="{ color: chart(0) }">const</span><span> gate = ramp.</span><span :style="{ color: chart(3) }">every</span><span>((step) =&gt; {
  </span><span :style="{ color: chart(0) }">return</span><span> Math.</span><span :style="{ color: chart(3) }">abs</span><span>(</span><span :style="{ color: chart(3) }">apca</span><span>(step, page)) &gt;= </span><span :style="{ color: chart(4) }">60</span><span>
})
</span><span :style="{ color: 'var(--p-text-muted)' }">// Fails loudly rather than shipping a soft ramp.</span><span>
</span><span :style="{ color: chart(0) }">if</span><span> (!gate) </span><span :style="{ color: chart(0) }">throw new</span><span> </span><span :style="{ color: chart(1) }">Error</span><span>(</span><span :style="{ color: chart(2) }">'ramp under target'</span><span>)</span></code></pre>
      </div>

      <p class="mt-2 text-[11px]" :style="{ color: 'var(--p-text-muted)' }">
        Figure 2 — the contrast gate, roughly forty lines shorter than the version
        we shipped first.
      </p>

      <!-- Tags -->
      <div class="mt-6 flex flex-wrap gap-1.5">
        <span
          v-for="(tag, i) in tags"
          :key="tag"
          class="rounded-full px-2.5 py-1 font-mono text-[11px]"
          :style="{
            color: 'var(--p-text)',
            background: `color-mix(in oklab, ${ramp(i * 2)} 16%, var(--p-surface))`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${ramp(i * 2)} 40%, transparent)`,
          }"
        >
          #{{ tag }}
        </span>
      </div>
    </article>
  </div>
</template>
